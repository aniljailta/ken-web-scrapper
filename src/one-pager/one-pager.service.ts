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
import { PagerStatus } from './type';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import {
  detectTopicClusterSystemPrompt,
  generateOnePagerSystemPrompt,
} from './constants';
import { PagerPage } from './entities/pager-page.entity';
import path, { join } from 'path';
import * as fs from 'fs';
import * as puppeteer from 'puppeteer';

import * as hbs from 'handlebars';
@Injectable()
export class OnePagerService {
  private readonly logger = new Logger(OnePagerService.name);
  private readonly chunkLength = 1000;
  private readonly model: OpenAI.Chat.ChatModel = 'gpt-3.5-turbo';
  private openai: OpenAI;

  constructor(
    @InjectRepository(Pager)
    private pagerRepository: Repository<Pager>,
    @InjectRepository(PagerChunks)
    private pagerChunksRepository: Repository<PagerChunks>,
    @InjectRepository(PagerPage)
    private pagerPageRepository: Repository<PagerPage>,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  async upload(file: Express.Multer.File, userId: string) {
    if (!file || file.mimetype !== 'application/pdf') {
      throw new Error('Invalid file format. Only PDF is supported.');
    }
    let pagerId: null | string = null;
    try {
      const data = await PdfParse(file.buffer);
      const fullText = data.text;
      const fileName = file.originalname;

      // Creating Pager Record
      const pager = await this.createPagerRecord(fileName, userId);

      pagerId = pager.id;

      const chunks = this.splitIntoChunks(fullText, this.chunkLength);
      const chunkEntities = chunks.map((content) => {
        return this.pagerChunksRepository.create({
          pagerId: pager.id,
          content,
        });
      });

      await this.pagerChunksRepository.save(chunkEntities);

      return {
        message: 'PDF processed and chunks stored successfully',
        data: pager,
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

  private async getPdfPaths(
    userId: string,
    pagerId: string,
  ): Promise<string[]> {
    const checkRecord = await this.pagerRepository.findOne({
      where: {
        id: pagerId,
        userId,
      },
      relations: ['pagerPage'],
    });
    if (!checkRecord) {
      throw new NotFoundException('No Pager Found');
    }
    // Example static paths, you can fetch from DB or generate dynamically
    return checkRecord.pagerPage.map(({ link }) =>
      path.join(__dirname, '../../public/pagers', link),
    );
  }

  async getPdfStreams(
    userId: string,
    pagerId: string,
  ): Promise<{ filename: string; stream: fs.ReadStream }[]> {
    const filePaths = await this.getPdfPaths(userId, pagerId);
    return filePaths.map((filePath) => ({
      filename: path.basename(filePath),
      stream: fs.createReadStream(filePath),
    }));
  }

  async findAll(userId: string) {
    const allUserPagers = await this.pagerRepository.find({
      where: {
        userId,
        status: PagerStatus.PROCESSED,
      },
    });
    return {
      data: allUserPagers,
      message: '',
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
    hbs.registerHelper('eq', (a, b) => a === b);

    const compiled = hbs.compile(source);
    return compiled(context);
  }
  async findOne(pagerId: string, userId: string) {
    //
    const checkRecord = await this.pagerRepository.findOne({
      where: {
        id: pagerId,
        userId,
      },
      relations: ['pagerPage'],
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

  private async createPagerRecord(fileName: string, userId: string) {
    return await this.pagerRepository.save({
      userId,
      name: fileName,
    });
  }

  private async updatePagerStatus(pagerId: string, status: PagerStatus) {
    const pager = await this.pagerRepository.findOneBy({ id: pagerId });
    if (!pager) throw new NotFoundException('Pager not found');

    pager.status = status;
    await this.pagerRepository.save(pager);
  }

  async detectTopicClusters(chunks: PagerChunks[]) {
    const chunkMap = chunks.reduce((acc, chunk) => {
      acc[chunk.id] = chunk.content;
      return acc;
    }, {});

    const prompt = detectTopicClusterSystemPrompt(chunkMap);
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    return JSON.parse(completion.choices[0].message.content || '{}');
  }

  async detectAllTopicClusters(allChunks: PagerChunks[], batchSize = 20) {
    const batches = this.batchChunks(allChunks, batchSize);
    const mergedClusters: Record<string, string[]> = {};

    for (const batch of batches) {
      const result = await this.detectTopicClusters(batch);
      for (const [slug, ids] of Object.entries(result)) {
        if (!mergedClusters[slug]) mergedClusters[slug] = [];
        // @ts-ignore
        mergedClusters[slug].push(...ids);
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

  private async fetchClusterAndTopic(
    pagerId: string,
  ): Promise<{ topicCluster: any; topics: any }> {
    //
    this.logger.debug('Generating Topic Cluster & Topics out of the Content');
    const allChunks = await this.fetchAllChunks(pagerId); // implement or inject
    const topicClusters = await this.detectAllTopicClusters(allChunks);

    const chunkById = Object.fromEntries(
      allChunks.map((c) => [c.id, c.content]),
    );
    const results = [];

    for (const [slug, chunkIds] of Object.entries(topicClusters)) {
      const chunkTexts = chunkIds
        .map((id) => chunkById[id] || '')
        .filter(Boolean);

      if (chunkTexts.join(' ').length < 200) continue;

      const onePager = await this.generateOnePager(slug, chunkTexts);
      results.push(onePager);
    }
    return {
      topicCluster: topicClusters,
      topics: results,
    };
  }

  async generateOnePager(topicSlug: string, chunkTexts: string[]) {
    const prompt = generateOnePagerSystemPrompt(chunkTexts);
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

  async generateAllOnePagers(pagerId: string, branding: any, userId: string) {
    //
    try {
      const checkRecord = await this.pagerRepository.findOne({
        where: {
          id: pagerId,
          userId,
        },
        relations: ['pagerPage'],
      });
      if (!checkRecord) {
        throw new NotFoundException('No Pager Found');
      }

      let topics = checkRecord.topics;
      let topicClusters = checkRecord.topicCluster;

      await this.updatePagerStatus(pagerId, PagerStatus.PROCESSING);

      if (this.isEmptyArray(topics) && this.isEmptyObject(topicClusters)) {
        const clusterAndTopic = await this.fetchClusterAndTopic(pagerId);

        topics = clusterAndTopic.topics;
        topicClusters = clusterAndTopic.topicCluster;

        // Saving Topic Cluster & Topics
        await this.pagerRepository.update(
          { id: pagerId },
          {
            topicCluster: topicClusters,
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
          },
        );
      }

      // If No Pages were created generate PDF!
      if (checkRecord.pagerPage.length < 1) {
        await this.generatePDF(checkRecord.id);
      }

      await this.updatePagerStatus(pagerId, PagerStatus.PROCESSED);

      const updatedPager = await this.pagerRepository.findOne({
        where: {
          id: pagerId,
          userId,
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
    pager.topics.map(async ({ json, topic_slug }) => {
      const record = this.pagerPageRepository.create({
        name: json.title,
        link: `${topic_slug}.pdf`,
        pagerId,
        pager: pager,
      });
      // Saving All Pages
      await this.pagerPageRepository.save(record);
      return record;
    });

    // Generating PDF
    await Promise.all(
      pager.topics.map(async ({ json, topic_slug }) => {
        const content = await this.renderTemplate('pager-template', {
          title: json.title,
          problem: json.problem,
          solution: json.solution,
          highlights: json.highlights,
          primaryColor: pager.branding?.primaryColor || null,
          secondaryColor: pager.branding?.secondaryColor || null,
          cta: json.cta,
        });
        return await this.generateAndSavePDF(content, `${topic_slug}.pdf`);
      }),
    );
    this.logger.debug('Finished Generating PDF');
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
      format: 'A4',
      printBackground: true,
    });

    await browser.close();

    // 📝 Save PDF to file
    const outputPath = path.join(__dirname, '../../public/pagers', fileName);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true }); // ensure folder exists
    fs.writeFileSync(outputPath, pdfBuffer);

    return fileName;
  }
}
