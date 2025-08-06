import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import PdfParse from 'pdf-parse';
import { Pager } from './entities/pager.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PagerChunks } from './entities/pager-chunks.entity';
import { PagerStatus, TopicContentMap, TopicJSON } from './type';
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
  sanitizePdfText,
} from './helper';
import { S3Service } from 'src/s3/s3.service';
import { User } from 'src/users/entities/user.entity';
@Injectable()
export class OnePagerService {
  private readonly logger = new Logger(OnePagerService.name);
  private readonly chunkLength = 1000;
  private readonly model: OpenAI.Chat.ChatModel = 'gpt-4';
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
    private readonly config: ConfigService,
    private readonly s3Service: S3Service,
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
        `Something went wrong while processing the PDF File!`,
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
      .innerJoinAndSelect('pager.pagerPage', 'pagerPage') // INNER JOIN ensures relation exists
      .where('pager.userId = :userId', { userId })
      .andWhere('pager.status = :status', { status: PagerStatus.PROCESSED })
      .orderBy('pager.created_date', 'DESC')
      .addOrderBy('pagerPage.index', 'DESC')
      .getMany();

    return {
      data: allUserPagers,
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
    //
    const checkRecord = await this.pagerRepository.findOne({
      where: {
        id: pagerId,
        userId,
      },
    });
    if (!checkRecord) {
      throw new NotFoundException('No Pager Found');
    }

    await this.pagerRepository.delete({
      id: checkRecord.id,
    });

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

    const compiled = hbs.compile(source);
    return compiled(context);
  }
  async findOne(pagerId: string, userId: string) {
    //
    const checkRecord = await this.pagerRepository.findOne({
      where: {
        id: pagerId,
      },
      relations: ['pagerPage'],
      order: {
        pagerPage: {
          index: 'DESC',
        },
      },
    });
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
  ): Promise<TopicContentMap> {
    const chunkMap = chunks.reduce((acc, chunk) => {
      acc[chunk.id] = chunk.content;
      return acc;
    }, {});

    const prompt = detectTopicClusterSystemPrompt(chunkMap, systemPrompt);
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    return JSON.parse(completion.choices[0].message.content || '{}');
  }

  async detectAllTopicClusters(
    allChunks: PagerChunks[],
    systemPrompt: string,
    batchSize = 20,
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
      const result = await this.detectTopicClusters(batch, systemPrompt);
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
  private isEmptyArray(arr: any): boolean {
    return Array.isArray(arr) && arr.length === 0;
  }

  private isEmptyObject(obj: any): boolean {
    return obj && typeof obj === 'object' && Object.keys(obj).length === 0;
  }

  private async fetchClusterAndTopic({
    pagerId,
    topicClusters,
    pagerJsonPrompt,
  }: {
    topicClusterPrompt: string;
    topicClusters: any;
    pagerJsonPrompt: string;
    pagerId: string;
  }): Promise<{ topicCluster: any; topics: any }> {
    //
    this.logger.debug('Generating Topic Cluster & Topics out of the Content');
    const allChunks = await this.fetchAllChunks(pagerId); // implement or inject

    const chunkById = Object.fromEntries(
      allChunks.map((c) => [c.id, c.content]),
    );
    const results = [];

    for (const [slug, chunkIds] of Object.entries(topicClusters)) {
      const chunkTexts = chunkIds
        // @ts-ignore
        .map(({ content: id }) => chunkById[id] || '')
        .filter(Boolean);

      if (chunkTexts.join(' ').length < 200) continue;
      // Below Method is the Second GPT call where the Actual JSON is being generated!
      const onePager = await this.generateOnePager(
        slug,
        chunkTexts,
        pagerJsonPrompt,
      );
      results.push({
        ...onePager,
        rank_index: chunkIds[0]?.rank_index || 1,
      });
    }
    return {
      topicCluster: topicClusters,
      topics: results,
    };
  }

  async generateOnePager(
    topicSlug: string,
    chunkTexts: string[],
    systemPrompt: string,
  ) {
    const prompt = generateOnePagerSystemPrompt(chunkTexts, systemPrompt);
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
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
        relations: ['pagerPage'],
      });
      if (!checkRecord) {
        throw new NotFoundException('No Pager Found');
      }

      let topics = checkRecord.topics;
      let topicClusters = checkRecord.topicCluster;

      await this.updatePagerStatus(pagerId, PagerStatus.PROCESSING);

      if (this.isEmptyArray(topics)) {
        // Using the Test prompts if provided
        if (topicClusterPrompt && pagerJsonPrompt) {
          const clusterAndTopic = await this.fetchClusterAndTopic({
            pagerId,
            topicClusterPrompt: topicClusterPrompt,
            pagerJsonPrompt: pagerJsonPrompt,
            topicClusters,
          });

          topics = clusterAndTopic.topics;
          topicClusters = clusterAndTopic.topicCluster;
        } else {
          const systemPrompts = await this.systemPromptsRepository.findOne({
            where: {},
          });
          if (!systemPrompts) {
            throw new NotFoundException('No System Prompts were Found!');
          }

          const clusterAndTopic = await this.fetchClusterAndTopic({
            pagerId,
            topicClusterPrompt: systemPrompts.topicClusterPrompt,
            pagerJsonPrompt: systemPrompts.pagerJsonPrompt,
            topicClusters,
          });

          topics = clusterAndTopic.topics;
          topicClusters = clusterAndTopic.topicCluster;
        }

        // Saving Topic Cluster & Topics
        await this.pagerRepository.update(
          { id: pagerId },
          {
            topics,
          },
        );
      }
      if (branding) {
        // Saving Branding Config
        await this.pagerRepository.update(
          { id: pagerId },
          {
            branding,
            name: branding && branding.name ? branding.name : checkRecord.name,
          },
        );
      }

      // If No Pages were created generate PDF!
      if (checkRecord.pagerPage.length < 1) {
        await this.generatePDF(checkRecord.id);
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

  private async generatePDF(pagerId: string) {
    this.logger.debug('Generating PDF');
    const pager = await this.pagerRepository.findOne({
      where: {
        id: pagerId,
      },
    });

    // Creating Pager Page Records
    pager.topics.map(async ({ json, topic_slug }, index: number) => {
      const rank_index =
        pager.topicCluster[topic_slug][0]?.rank_index || index + 1;
      const source_type = pager.topicCluster[topic_slug][0]?.source_type || '';
      const tags = pager.topicCluster[topic_slug][0]?.tags || [];
      const shortId = pagerId.slice(-6);
      const fileName = `${topic_slug}-${shortId}.pdf`;
      const record = this.pagerPageRepository.create({
        name: json.title,
        link: fileName,
        pagerId,
        index: rank_index,
        source_type,
        tags,
        pager: pager,
      });
      // Saving All Pages
      await this.pagerPageRepository.save(record);
      return record;
    });

    // Generating PDF
    await Promise.all(
      pager.topics.map(async ({ json, topic_slug }) => {
        const shortId = pagerId.slice(-6);
        const fileName = `${topic_slug}-${shortId}.pdf`;
        return await this.generateContent({
          branding: pager.branding,
          fileName,
          json,
        });
      }),
    );
    this.logger.debug('Finished Generating PDF');
  }

  private async generateContent({
    json,
    branding,
    fileName,
  }: {
    json: TopicJSON;
    branding: any;
    fileName: string;
  }) {
    const content = await this.renderTemplate('pager-template', {
      title: json.title,
      subTitle: json.subtitle || '',
      problem: json.problem,
      quote: json.quote,
      solution: json.solution,
      highlights: json.highlights,
      primaryColor: branding?.primaryColor || PagerDefaultPrimaryColor,
      secondaryColor: branding?.secondaryColor || PagerDefaultSecondaryColor,
      primaryTextColor: getContrastingTextColor(
        branding?.primaryColor || PagerDefaultPrimaryColor,
      ),
      secondaryTextColor: getContrastingTextColor(
        branding?.secondaryColor || PagerDefaultSecondaryColor,
      ),
      logo: branding?.logo || PagerDefaultLogo,
      cta: json.cta,
      ctaText: json?.ctaText || 'Access Full Report',
      ctaLink: json?.ctaLink ? ensureHttps(json.ctaLink) : '#',
    });
    return await this.generateAndSavePDF(content, fileName);
  }

  async editPagerContent({
    id,
    userId,
    content,
    topicIndex,
  }: {
    id: string;
    userId: string;
    topicIndex: number;
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
      fileName: checkPagerPage.link,
    });

    // Updating Topic Content
    await this.pagerRepository.update(
      {
        id: checkPager.id,
      },
      {
        topics: checkPager.topics.map((item, index) =>
          index === topicIndex ? { ...item, json: content } : item,
        ),
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
  ): Promise<string> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

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
        link: fileName,
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
  async triggerTopicGeneration(pagerId: string) {
    try {
      this.logger.debug('Generating Topics List');
      const checkRecord = await this.pagerRepository.findOne({
        where: {
          id: pagerId,
        },
        relations: ['pagerPage'],
      });
      if (!checkRecord) {
        throw new NotFoundException('No Pager Found');
      }

      let topics = checkRecord.topicCluster;

      if (this.isEmptyObject(topics)) {
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
        );
        topics = topicClusters;
      }

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
      this.logger.error('Failed To Generate Enhancement!', error);

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

  async updatePagerTopics(
    pagerId: string,
    allowedSlugs: string[],
    topicClusters: any,
  ) {
    try {
      this.logger.debug('Updating Pager Topics');
      const checkRecord = await this.pagerRepository.findOne({
        where: {
          id: pagerId,
        },
        relations: ['pagerPage'],
      });
      if (!checkRecord) {
        throw new NotFoundException('No Pager Found');
      }

      const updatedTopicContent = Object.keys(topicClusters)
        .filter((key) => allowedSlugs.includes(key))
        .reduce((acc, key) => {
          acc[key] = topicClusters[key];
          return acc;
        }, {});

      // Updating Topics & Keep only the User Requires
      await this.pagerRepository.update(
        {
          id: pagerId,
        },
        {
          topicCluster: updatedTopicContent,
        },
      );

      return {
        data: {
          id: pagerId,
        },
      };
    } catch (error) {
      this.logger.error('Failed To Save Topics Content!', error);

      return {
        data: {
          id: pagerId,
        },
        error: error,
      };
    }
  }
}
