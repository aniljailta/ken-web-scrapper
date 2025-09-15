import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import PdfParse from 'pdf-parse';
import { Pager } from './entities/pager.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PagerChunks } from './entities/pager-chunks.entity';
import {
  PagerStatus,
  PageUserFeedBack,
  TopicContentMap,
  TopicJSON,
} from './type';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import {
  detectTopicClusterSystemPrompt,
  generateEnhancementSectionSystemPrompt,
  generateOnePagerSystemPrompt,
  PagerDefaultLogo,
  PagerDefaultPrimaryColor,
  PagerDefaultSecondaryColor,
} from './constants';
import { PagerPage } from './entities/pager-page.entity';
import { join } from 'path';
import * as fs from 'fs';
import * as puppeteer from 'puppeteer';

import * as hbs from 'handlebars';
import { SystemPrompts } from './entities/system-prompts.entity';
import { UpdateSystemPromptDTO } from './dto/update-system-prompt.dto';
import {
  ensureHttps,
  extractS3KeyFromUrl,
  getContrastingTextColor,
  hexToRgba,
  sanitizePdfText,
} from './helper';
import { S3Service } from 'src/s3/s3.service';
import { User } from 'src/users/entities/user.entity';
import showdown from 'showdown';
import { SocketService } from 'src/gateways/socket.service';
import { PageContent } from './entities/page-content.entity';
import { PagerBranding } from './entities/pager-branding.entity';
import { Tag } from './entities/tag.entity';
import { TopicCluster } from './entities/topic-cluster.entity';
import { PaginationDto } from 'src/common/dto/pagination.dto';
@Injectable()
export class OnePagerService {
  private readonly logger = new Logger(OnePagerService.name);
  private readonly chunkLength = 1000;
  private readonly model: OpenAI.Chat.ChatModel = 'gpt-3.5-turbo-16k';
  private openai: OpenAI;

  constructor(
    @InjectRepository(Pager)
    private pagerRepository: Repository<Pager>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SystemPrompts)
    private systemPromptsRepository: Repository<SystemPrompts>,
    @InjectRepository(PagerChunks)
    private pagerChunksRepository: Repository<PagerChunks>,
    @InjectRepository(PagerPage)
    private pagerPageRepository: Repository<PagerPage>,
    @InjectRepository(PageContent)
    private pageContentRepository: Repository<PageContent>,
    @InjectRepository(PagerBranding)
    private pagerBrandingRepository: Repository<PagerBranding>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(TopicCluster)
    private topicClusterRepository: Repository<TopicCluster>,
    private readonly dataSource: DataSource,

    private readonly config: ConfigService,
    private readonly s3Service: S3Service,
    private readonly socketService: SocketService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  async upload(file: Express.Multer.File, userId?: string) {
    if (!file || file.mimetype !== 'application/pdf') {
      throw new Error('Invalid file format. Only PDF is supported.');
    }
    let pagerId: null | string = null;
    try {
      const data = await PdfParse(file.buffer);
      const pdfText = data.text;
      const fullText = sanitizePdfText(pdfText);

      // If throwing Error if Pdf not able to parse!
      if (!fullText) {
        throw new BadRequestException(
          'Unable to read PDF, please upload a valid file.',
        );
      }
      const fileName = file.originalname;
      let checkUser: User = null;

      if (userId) {
        checkUser = await this.userRepository.findOne({
          where: {
            id: userId,
          },
        });
      }

      // Creating Pager Record
      const pager = await this.createPagerRecord(
        fileName,
        checkUser ? checkUser.id : undefined,
      );

      pagerId = pager.id;

      const chunks = this.splitIntoChunks(fullText, this.chunkLength);
      const chunkEntities = chunks.map((content) => {
        return this.pagerChunksRepository.create({
          pagerId: pager.id,
          content,
        });
      });

      await this.pagerChunksRepository.save(chunkEntities);

      const updatedPager = await this.findOne(pagerId, userId);

      return {
        message: 'PDF processed and chunks stored successfully',
        data: updatedPager.data || null,
      };
    } catch (error) {
      this.logger.error(
        `Exception thrown: ${JSON.stringify(error.message)}\n${error.stack}`,
      );

      //   Updating Status of the Uploaded Pager
      if (pagerId) {
        await this.updatePagerStatus(pagerId, PagerStatus.FAILED);
      }
      throw new BadGatewayException(
        `Unable to read PDF, please upload a valid file`,
      );
    }
  }

  async getPdfStreams(
    pagerId: string,
  ): Promise<{ link: string; fileName: string }[]> {
    const checkPager = await this.pagerRepository.findOne({
      where: {
        id: pagerId,
      },
    });
    if (!checkPager) {
      throw new NotFoundException('No Pager Found!');
    }

    const pages = await this.pagerPageRepository.find({
      where: {
        pagerId: checkPager.id,
      },
    });

    return pages.map(({ link, name }) => ({
      fileName: name,
      link: extractS3KeyFromUrl(link),
    }));
  }

  async findAll(userId: string) {
    const allUserPagers = await this.pagerRepository
      .createQueryBuilder('pager')
      .innerJoinAndSelect('pager.pagerPage', 'pagerPage')
      .leftJoinAndSelect('pager.tags', 'tags')
      .where('pager.userId = :userId', { userId })
      .andWhere('pager.status = :status', { status: PagerStatus.PROCESSED })
      .orderBy('pagerPage.created_date', 'DESC')
      .getMany();

    return {
      data: allUserPagers,
      message: '',
    };
  }

  async getUserActivities(
    userId: string,
    { pageSize, current }: PaginationDto,
  ) {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });

    if (user.role !== 'admin') {
      throw new BadRequestException('Not Allowed!');
    }
    const [allUserPagers, total] = await this.pagerRepository.findAndCount({
      where: {
        status: PagerStatus.PROCESSED,
      },
      relations: {
        user: true,
        pagerPage: true,
      },
      order: {
        created_date: 'DESC',
      },
      skip: (current - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: {
        pagers: allUserPagers,
        pagination: {
          current,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
      message: '',
    };
  }

  async findAllSystemPrompt() {
    const checkRecord = await this.systemPromptsRepository.findOne({
      where: {},
    });

    if (!checkRecord) {
      return await this.systemPromptsRepository.save({
        pagerJsonPrompt: '',
        topicClusterPrompt: '',
      });
    }

    return {
      data: checkRecord,
      message: '',
    };
  }

  async updateSystemPrompt(payload: UpdateSystemPromptDTO) {
    const checkRecord = await this.systemPromptsRepository.findOne({
      where: {},
    });

    if (!checkRecord) {
      throw new NotFoundException('No Record Found');
    }

    await this.systemPromptsRepository.update(
      {
        id: checkRecord.id,
      },
      payload,
    );

    return {
      data: checkRecord,
      message: 'System Prompts Updated!',
    };
  }

  async deletePagerPage(pagerId: string) {
    //
    const checkRecord = await this.pagerPageRepository.findOne({
      where: {
        id: pagerId,
      },
    });
    if (!checkRecord) {
      throw new NotFoundException('No Page Found');
    }

    await this.pagerPageRepository.delete({
      id: checkRecord.id,
    });

    return {
      data: null,
      message: 'Pager Page Deleted',
    };
  }

  async deletePager(pagerId: string, userId: string) {
    // 🔎 Check if pager exists
    const checkRecord = await this.pagerRepository.findOne({
      where: { id: pagerId, userId },
      relations: ['topicClusters', 'topicClusters.pagerChunks'], // preload relations
    });

    if (!checkRecord) {
      throw new NotFoundException('No Pager Found');
    }

    // 🧹 First, remove join-table links manually (avoids FK constraint errors)
    for (const cluster of checkRecord.topicClusters || []) {
      if (cluster.pagerChunks?.length) {
        await this.topicClusterRepository
          .createQueryBuilder()
          .relation('pagerChunks')
          .of(cluster) // cluster ID
          .remove(cluster.pagerChunks);
      }
    }

    // 🗑️ Delete TopicClusters for this pager (will also clean join rows if cascade set)
    await this.topicClusterRepository.delete({ pager: { id: pagerId } });

    // 🗑️ Delete PagerChunks for this pager (if they’re independent, not reused elsewhere)
    await this.pagerChunksRepository.delete({ pagerId });

    // 🗑️ Finally, delete the Pager itself
    await this.pagerRepository.delete(checkRecord.id);

    return {
      data: null,
      message: 'Pager Deleted',
    };
  }

  private async renderTemplate(
    templateName: string,
    context: any,
  ): Promise<string> {
    const templatePath = join('src', 'views', `${templateName}.hbs`);
    const source = fs.readFileSync(templatePath, 'utf8');

    hbs.registerHelper(
      'capitalize',
      (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
    );
    hbs.registerHelper('inc', function (value) {
      return parseInt(value) + 1;
    });
    hbs.registerHelper('limit', function (arr, limit) {
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, limit);
    });

    hbs.registerHelper('eq', (a, b) => a === b);

    hbs.registerHelper('stripPTags', function (htmlString) {
      const trimmed = htmlString.trim();
      if (trimmed.startsWith('<p>') && trimmed.endsWith('</p>')) {
        return new hbs.SafeString(trimmed.slice(3, -4));
      }
      return new hbs.SafeString(htmlString);
    });

    const compiled = hbs.compile(source);
    return compiled(context);
  }
  async findOne(pagerId: string, userId: string) {
    //
    const checkRecord = await this.pagerRepository
      .createQueryBuilder('pager')
      .leftJoinAndSelect('pager.pagerPage', 'pagerPage')
      .leftJoinAndSelect('pagerPage.pageContent', 'pageContent')
      .leftJoinAndSelect('pager.branding', 'branding')
      .leftJoinAndSelect('pager.tags', 'tags')
      .where('pager.id = :pagerId', { pagerId })
      .orderBy('pagerPage.created_date', 'DESC')
      .getOne();

    if (!checkRecord) {
      throw new NotFoundException('No Pager Found');
    }

    return {
      data: checkRecord,
      message: '',
    };
  }

  private splitIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      chunks.push(text.slice(start, start + maxLength));
      start += maxLength;
    }

    return chunks;
  }

  private async createPagerRecord(fileName: string, userId?: string) {
    return await this.pagerRepository.save(
      userId
        ? {
            userId,
            name: fileName,
          }
        : {
            name: fileName,
          },
    );
  }

  private async updatePagerStatus(pagerId: string, status: PagerStatus) {
    const pager = await this.pagerRepository.findOneBy({ id: pagerId });
    if (!pager) throw new NotFoundException('Pager not found');

    pager.status = status;
    await this.pagerRepository.save(pager);
  }

  async detectTopicClusters(
    chunks: PagerChunks[],
    systemPrompt: string,
    userId: string,
  ): Promise<TopicContentMap> {
    const chunkMap = chunks.reduce((acc, chunk) => {
      acc[chunk.id] = chunk.content;
      return acc;
    }, {});

    const prompt = detectTopicClusterSystemPrompt(systemPrompt);

    // Estimated tokens (can be adjusted dynamically later)
    let estimatedTotal = 300;
    let receivedTokens = 0;
    let fullResponse = '';

    // Start streaming
    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: JSON.stringify(chunkMap, null, 2),
        },
      ],
      temperature: 0.2,
      stream: true,
    });

    // Loop through chunks as they come in
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';

      if (content) {
        fullResponse += content;
        receivedTokens += content.length;

        // Dynamically adjust if needed
        if (receivedTokens > estimatedTotal * 0.9) {
          estimatedTotal += 100; // Add more "space" for long answers
        }

        const percent = Math.min((receivedTokens / estimatedTotal) * 100, 100);
        // Send progress to frontend
        await this.socketService.sendProgress({ userId, progress: percent });
      }
    }

    // Final completion
    await this.socketService.sendProgress({
      userId,
      progress: 100,
      finished: true,
    });

    // Return parsed JSON from final response
    return JSON.parse(fullResponse || '{}');
  }

  async detectAllTopicClusters(
    allChunks: PagerChunks[],
    systemPrompt: string,
    batchSize = 20,
    userId: string,
  ) {
    const batches = this.batchChunks(allChunks, batchSize);
    const mergedClusters: Record<
      string,
      Array<{
        content: string;
        rank_index: number;
        source_type: string;
        title: string;
        tags: string[];
      }>
    > = {};

    for (const batch of batches) {
      const result = await this.detectTopicClusters(
        batch,
        systemPrompt,
        userId,
      );
      for (const [slug, content] of Object.entries(result)) {
        if (!mergedClusters[slug]) mergedClusters[slug] = [];
        content.chunk_ids.forEach((item) => {
          mergedClusters[slug].push({
            content: item,
            rank_index: content.rank_index,
            title: content.title,
            source_type: content.source_type,
            tags: content.tags,
          });
        });
      }
    }
    return mergedClusters;
  }

  private batchChunks(chunks: PagerChunks[], size = 20) {
    const batches = [];
    for (let i = 0; i < chunks.length; i += size) {
      batches.push(chunks.slice(i, i + size));
    }
    return batches;
  }
  async fetchChunksBySlug(
    pagerId: string,
    slug: string,
  ): Promise<PagerChunks[]> {
    return await this.pagerChunksRepository
      .createQueryBuilder('chunk')
      .innerJoin('chunk.topicClusters', 'cluster')
      .where('cluster.pagerId = :pagerId', { pagerId })
      .andWhere('cluster.slug = :slug', { slug })
      .select(['chunk.id', 'chunk.content'])
      .distinct(true)
      .getMany();
  }
  async fetchSlugsByPager(pagerId: string): Promise<string[]> {
    const clusters = await this.topicClusterRepository.find({
      where: { pagerId },
      select: ['slug'],
    });

    return clusters.map((c) => c.slug);
  }

  private async fetchClusterAndTopic({
    pagerId,
    pagerJsonPrompt,
    userId,
    brandingWebsite,
  }: {
    topicClusterPrompt: string;
    pagerJsonPrompt: string;
    pagerId: string;
    userId: string;
    brandingWebsite: string;
  }): Promise<void> {
    this.logger.debug('Generating Actual Pager Content from the Topics');
    const pager = await this.pagerRepository.findOne({
      where: {
        id: pagerId,
      },
    });
    const slugs = await this.fetchSlugsByPager(pagerId);

    const totalClusters = slugs.length;
    let progress = 0;
    const increment = totalClusters > 0 ? 100 / totalClusters : 0;

    for (const slug of slugs) {
      const contents = await this.fetchChunksBySlug(pagerId, slug);
      const chunkTexts = contents
        .map(({ content }) => content || '')
        .filter(Boolean);

      if (chunkTexts.join(' ').length < 200) {
        continue; // ✅ works fine here
      }

      // 🚀 Second GPT call
      const onePager = await this.generateOnePager(
        slug,
        chunkTexts,
        pagerJsonPrompt,
      );
      // Saving the generated Content;
      await this.createPagerPage(
        pager,
        pagerId,
        { ...onePager.json, ctaLink: brandingWebsite },
        onePager.topic_slug,
        1,
      );

      // 📡 Send progress update
      progress += increment;

      this.socketService.sendProgress({
        progress: Math.min(Math.round(progress), 100),
        userId,
      });
    }
  }

  async generateOnePager(
    topicSlug: string,
    chunkTexts: string[],
    systemPrompt: string,
  ) {
    const prompt = generateOnePagerSystemPrompt(systemPrompt);
    const completion = await this.openai.chat.completions.create({
      // Second GPT Modal
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: chunkTexts.join('\n\n'),
        },
      ],
      temperature: 0.3,
    });

    return {
      topic_slug: topicSlug,
      json: JSON.parse(completion.choices[0].message.content || '{}'),
    };
  }

  async generateAllOnePagers({
    pagerId,
    branding,
    userId,
    isTesting = false,
    topicClusterPrompt,
    pagerJsonPrompt,
  }: {
    pagerId: string;
    branding: any;
    userId: string;
    isTesting?: boolean;
    topicClusterPrompt?: string;
    pagerJsonPrompt?: string;
  }) {
    //
    try {
      const checkRecord = await this.pagerRepository.findOne({
        where: {
          id: pagerId,
        },
        relations: ['pagerPage', 'topicClusters'],
      });
      if (!checkRecord) {
        throw new NotFoundException('No Pager Found');
      }

      await this.updatePagerStatus(pagerId, PagerStatus.PROCESSING);

      // Using the Test prompts if provided
      if (topicClusterPrompt && pagerJsonPrompt) {
        await this.fetchClusterAndTopic({
          pagerId,
          topicClusterPrompt: topicClusterPrompt,
          pagerJsonPrompt: pagerJsonPrompt,
          userId,
          brandingWebsite: branding?.website || '',
        });
      } else {
        const systemPrompts = await this.systemPromptsRepository.findOne({
          where: {},
        });
        if (!systemPrompts) {
          throw new NotFoundException('No System Prompts were Found!');
        }

        await this.fetchClusterAndTopic({
          pagerId,
          topicClusterPrompt: systemPrompts.topicClusterPrompt,
          pagerJsonPrompt: systemPrompts.pagerJsonPrompt,
          brandingWebsite: branding?.website || '',
          userId,
        });
      }

      if (branding) {
        // Either Creating Or Updating
        const existing = await this.pagerBrandingRepository.findOne({
          where: { pagerId },
        });

        await this.pagerRepository.update(
          {
            id: pagerId,
          },
          {
            name: branding?.name ?? existing?.name, // keep old name if not provided
          },
        );

        await this.pagerBrandingRepository.save({
          pagerId,
          ...branding,
          name: branding?.name ?? existing?.name, // keep old name if not provided
          id: existing?.id, // ensures update instead of insert
        });
      }

      // If No Pages were created generate PDF!
      if (checkRecord.pagerPage.length < 1) {
        await this.generatePDF({
          pagerId: checkRecord.id,
          userId,
        });
      }

      if (!isTesting) {
        // Marking Pager record as processed only if It's not generated by the Admin!
        await this.updatePagerStatus(pagerId, PagerStatus.PROCESSED);
      }

      const updatedPager = await this.pagerRepository.findOne({
        where: {
          id: pagerId,
        },
        relations: ['pagerPage'],
      });

      return {
        message: '✅ One-Pagers generated',
        data: updatedPager,
      };
    } catch (error) {
      this.logger.error(
        `Exception thrown: ${JSON.stringify(error.message)}\n${error.stack}`,
      );
      await this.updatePagerStatus(pagerId, PagerStatus.FAILED);
      throw new BadGatewayException(
        `Something went wrong while processing the PDF File!`,
      );
    }
  }

  private parseMarkDown(text: string) {
    //
    const converter = new showdown.Converter();
    const content = converter.makeHtml(text);
    return content;
  }
  private async getOrCreateTags(tagNames: string[]): Promise<Tag[]> {
    return Promise.all(
      tagNames.map(async (tagName) => {
        const normalized = tagName.trim().toLowerCase().replace(/\s+/g, '_');

        let tag = await this.tagRepository.findOne({
          where: { name: normalized },
        });

        if (!tag) {
          tag = this.tagRepository.create({ name: normalized });
          tag = await this.tagRepository.save(tag);
        }

        return tag;
      }),
    );
  }

  private async createPagerPage(
    pager: Pager,
    pagerId: string,
    json: any,
    topic_slug: string,
    rank_index: number,
  ): Promise<PagerPage> {
    const shortId = pagerId.slice(-6);
    const fileName = `${topic_slug}-${shortId}.pdf`;

    const record = this.pagerPageRepository.create({
      name: json.title,
      link: fileName,
      pagerId,
      index: rank_index,
      pager: pager,
    });

    const pagerPage = await this.pagerPageRepository.save(record);

    await this.pageContentRepository.save({
      pagerPageId: pagerPage.id,
      ...json,
    });

    return pagerPage;
  }

  private async generatePDF({
    pagerId,
    userId,
  }: {
    pagerId: string;
    userId: string;
  }) {
    this.logger.debug('Generating PDF');
    const pager = await this.pagerRepository.findOne({
      where: {
        id: pagerId,
      },
      relations: ['branding', 'tags', 'topicClusters', 'pagerPage'],
    });

    // Generating PDF
    await Promise.all(
      pager.pagerPage.map(async ({ id }) => {
        const content = await this.pageContentRepository.findOne({
          where: {
            pagerPageId: id,
          },
        });
        const shortId = pagerId.slice(-6);
        // Just keeping it Unique!
        const fileName = `${content.id.slice(-6)}-${shortId}.pdf`;
        return await this.generateContent({
          pagerPageId: id,
          branding: pager.branding,
          fileName,
          json: {
            cta: content?.cta || '',
            ctaLink: content?.ctaLink || '',
            ctaText: content?.ctaText || '',
            problem: content?.problem || '',
            solution: content?.solution || '',
            highlights: content?.highlights || [],
            title: content?.title || '',
            subtitle: content?.subtitle || '',
            index: 1,
            quote: '',
          },
        });
      }),
    );
    // Sending Back Completion Progress!
    await this.socketService.sendProgress({
      userId,
      progress: 100,
      finished: true,
    });
    this.logger.debug('Finished Generating PDF');
  }

  private async generateContent({
    json,
    branding,
    fileName,
    pagerPageId,
  }: {
    json: TopicJSON;
    branding: any;
    fileName: string;
    pagerPageId: string;
  }) {
    const content = await this.renderTemplate('pager-template', {
      title: this.parseMarkDown(json.title || ''),
      subTitle: this.parseMarkDown(json.subtitle || ''),
      problem: this.parseMarkDown(json.problem),
      solution: this.parseMarkDown(json.solution),
      highlights: json.highlights.map((item) => this.parseMarkDown(item)),
      primaryColor: branding?.primaryColor || PagerDefaultPrimaryColor,
      secondaryColor: branding?.secondaryColor || PagerDefaultSecondaryColor,
      secondaryLightBgColor: hexToRgba(
        branding?.secondaryColor || PagerDefaultSecondaryColor,
        0.1,
      ),
      primaryTextColor: getContrastingTextColor(
        branding?.primaryColor || PagerDefaultPrimaryColor,
      ),
      secondaryTextColor: getContrastingTextColor(
        branding?.secondaryColor || PagerDefaultSecondaryColor,
      ),
      logo: branding?.logo || PagerDefaultLogo,
      cta: this.parseMarkDown(json.cta),
      ctaText: json?.ctaText || 'Access Full Report',
      ctaLink: json?.ctaLink ? ensureHttps(json.ctaLink) : '',
    });
    return await this.generateAndSavePDF(content, fileName, pagerPageId);
  }

  async editPagerContent({
    id,
    content,
    pageContentId,
  }: {
    id: string;
    userId: string;
    pageContentId: string;
    content: TopicJSON;
  }) {
    const checkPagerPage = await this.pagerPageRepository.findOne({
      where: {
        id,
      },
    });

    const checkPager = await this.pagerRepository.findOne({
      where: {
        id: checkPagerPage.pagerId,
      },
      relations: ['pagerPage', 'pagerPage.pageContent', 'branding', 'tags'],
    });

    if (!checkPager) {
      throw new NotFoundException('No Pager Found!');
    }

    if (!checkPagerPage) {
      throw new NotFoundException('No Page Found!');
    }

    // Generating New PDF Out of the Changed Content!
    await this.generateContent({
      json: content,
      branding: checkPager.branding,
      pagerPageId: checkPagerPage.id,
      fileName: checkPagerPage.link,
    });

    // Updating Topic Content
    await this.pageContentRepository.update(
      {
        id: pageContentId,
      },
      {
        ...content,
      },
    );

    // Updating Name
    await this.pagerPageRepository.update(
      {
        id: checkPagerPage.id,
      },
      {
        name: content.title,
      },
    );

    return checkPagerPage;
    //
  }

  private async fetchAllChunks(pagerId: string): Promise<PagerChunks[]> {
    return await this.pagerChunksRepository.find({
      where: { pagerId },
      select: ['content', 'id'],
    });
  }

  private async generateAndSavePDF(
    html: string,
    fileName: string,
    pagerPageId: string,
  ): Promise<string> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 0 });
    // Wait for all images to load
    await page.evaluate(async () => {
      const selectors = Array.from(document.images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve, reject) => {
          img.addEventListener('load', resolve);
          img.addEventListener('error', resolve);
        });
      });
      await Promise.all(selectors);
    });
    await page.evaluateHandle('document.fonts.ready');

    // Create PDF buffer
    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: '612px',
      height: '792px',
      margin: {
        bottom: 0,
        right: 0,
        left: 0,
        top: 0,
      },
    });

    await browser.close();

    const link = await this.s3Service.uploadPdfBuffer(
      // @ts-ignore
      pdfBuffer,
      `pagers/${fileName}`,
    );

    // Updating Links
    await this.pagerPageRepository.update(
      {
        id: pagerPageId,
      },
      {
        link,
      },
    );

    return link;
  }

  async enhanceTextSection({
    initialValue,
    sectionType,
  }: {
    initialValue: string;
    sectionType: string;
  }) {
    try {
      this.logger.debug({
        initialValue,
        sectionType,
      });
      const prompt = generateEnhancementSectionSystemPrompt(
        sectionType,
        initialValue,
      );
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      });

      return completion.choices[0].message.content || '';
    } catch (error) {
      this.logger.error('Failed To Generate Enhancement!', error);
      return '';
    }
  }
  async triggerTopicGeneration(pagerId: string, userId: string) {
    try {
      this.logger.debug('Generating Topics List');
      let checkRecord = await this.pagerRepository.findOne({
        where: {
          id: pagerId,
        },
        relations: ['pagerPage'],
      });
      if (!checkRecord) {
        throw new NotFoundException('No Pager Found');
      }

      let topics = checkRecord.topicClusters;
      const systemPrompts = await this.systemPromptsRepository.findOne({
        where: {},
      });
      if (!systemPrompts) {
        throw new NotFoundException('No System Prompts were Found!');
      }
      const allChunks = await this.fetchAllChunks(pagerId); // implement or inject
      const topicClusters = await this.detectAllTopicClusters(
        allChunks,
        systemPrompts.topicClusterPrompt,
        21,
        userId,
      );

      // Saving Pager Source_type & Tags
      // Safely extract source_type (first available)
      const source_type =
        Object.entries(topicClusters)
          .map(([_, value]) => value?.[0]?.source_type ?? null)
          .find((s) => s !== null) || null;

      // Safely extract all tags into a flat string array
      const tagNames: string[] = Object.entries(topicClusters)
        .map(([_, value]) => value?.[0]?.tags ?? [])
        .flat()
        .filter(
          (tag): tag is string =>
            typeof tag === 'string' && tag.trim().length > 0,
        );

      // ✅ fetch or create tags
      const tagEntities = await this.getOrCreateTags(tagNames);
      // Deduplicate by tag.id
      const uniqueTags = Array.from(
        new Map(tagEntities.map((tag) => [tag.id, tag])).values(),
      );
      checkRecord.tags = uniqueTags;
      checkRecord.source_type = source_type;
      checkRecord = await this.pagerRepository.save(checkRecord);

      // 👉 delegate saving to new method
      await this.createOrUpdateClusters(topicClusters, pagerId);

      // @ts-ignore
      topics = topicClusters;
      return {
        data: {
          id: pagerId,
          topicData: Object.keys(topics).map((item) => ({
            title: topics[item][0].title,
            topic_slug: item,
          })),
          topics,
        },
      };
    } catch (error) {
      this.logger.error('Failed to Generate Topics', error);

      return {
        data: {
          id: pagerId,
          topicData: [],
          topics: {},
        },
        error: error,
      };
    }
  }

  async createOrUpdateClusters(
    topicClusters: Record<string, any[]>,
    pagerId: string,
  ): Promise<void> {
    for (const [slug, items] of Object.entries(topicClusters)) {
      // 1️⃣ Find existing cluster or create new one
      let cluster = await this.topicClusterRepository.findOne({
        where: { slug, pagerId },
        relations: ['pagerChunks'],
      });

      if (!cluster) {
        cluster = this.topicClusterRepository.create({
          pagerId,
          slug,
        });
      }

      // 2️⃣ Attach chunks
      const chunkIds = items.map((i) => i.content);
      const chunks = await this.pagerChunksRepository.find({
        where: { id: In(chunkIds) },
      });

      // ensure uniqueness of pagerChunks
      const existingChunkIds = new Set(
        (cluster.pagerChunks ?? []).map((c) => c.id),
      );
      const newChunks = chunks.filter((c) => !existingChunkIds.has(c.id));

      cluster.pagerChunks = [...(cluster.pagerChunks ?? []), ...newChunks];
      cluster.pagerId = pagerId;

      // 3️⃣ Save cluster
      await this.topicClusterRepository.save(cluster);
    }
  }

  async updatePagerTopics(pagerId: string, allowedSlugs: string[]) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.debug('Updating Pager Topics');

      const pager = await this.pagerRepository.findOne({
        where: { id: pagerId },
        relations: ['pagerPage'],
      });
      if (!pager) {
        throw new NotFoundException('No Pager Found');
      }

      // 🔹 Fetch all clusters linked to this pager
      const allClusters = await this.topicClusterRepository.find({
        relations: ['pagerChunks'],
      });

      // 🔹 Delete clusters NOT in allowedSlugs
      const clustersToDelete = allClusters.filter(
        (c) => !allowedSlugs.includes(c.slug),
      );

      if (clustersToDelete.length > 0) {
        await queryRunner.manager.remove(clustersToDelete);
      }

      await queryRunner.commitTransaction();

      return {
        data: { id: pagerId },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed To Update Pager Topics!', error);
      return {
        data: { id: pagerId },
        error,
      };
    } finally {
      await queryRunner.release();
    }
  }

  async handlePageFeedback(pageId: string, response: PageUserFeedBack) {
    //
    const checkPagerPage = await this.pagerPageRepository.findOne({
      where: {
        id: pageId,
      },
    });
    if (!checkPagerPage) {
      throw new NotFoundException('No Page Found');
    }

    // Updating Feedback
    await this.pagerPageRepository.update(
      {
        id: checkPagerPage.id,
      },
      {
        userResponse: response,
      },
    );

    return {
      data: checkPagerPage,
      message: 'Thanks for your Feedback!',
    };
  }
}
