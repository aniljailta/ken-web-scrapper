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
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: config.get<string>('OPENAI_API_KEY'),
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

  async findOne(pagerId: string, userId: string) {
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

  private batchChunks(chunks, size = 20) {
    const batches = [];
    for (let i = 0; i < chunks.length; i += size) {
      batches.push(chunks.slice(i, i + size));
    }
    return batches;
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

  async generateAllOnePagers(pagerId: string, userId: string) {
    //
    try {
      const checkRecord = await this.pagerRepository.findOne({
        where: {
          id: pagerId,
          userId,
        },
      });
      if (!checkRecord) {
        throw new NotFoundException('No Pager Found');
      }

      await this.updatePagerStatus(pagerId, PagerStatus.PROCESSING);

      const allChunks = await this.fetchAllChunks(pagerId); // implement or inject
      const topicClusters = await this.detectAllTopicClusters(allChunks);

      // Saving Topic Cluster
      await this.pagerRepository.update(
        { id: pagerId },
        {
          topicCluster: topicClusters,
        },
      );

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
      // Saving Topic Cluster
      await this.pagerRepository.update(
        { id: pagerId },
        {
          topics: results,
        },
      );

      await this.updatePagerStatus(pagerId, PagerStatus.PROCESSED);

      return {
        message: '✅ One-Pagers generated',
        data: results,
        total: results.length,
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

  private async fetchAllChunks(pagerId): Promise<PagerChunks[]> {
    return await this.pagerChunksRepository.find({
      where: { pagerId },
      select: ['content', 'id'],
    });
  }
}
