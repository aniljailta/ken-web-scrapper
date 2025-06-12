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
@Injectable()
export class OnePagerService {
  private readonly logger = new Logger(OnePagerService.name);
  private readonly chunkLength = 1000;
  constructor(
    @InjectRepository(Pager)
    private pagerRepository: Repository<Pager>,
    @InjectRepository(PagerChunks)
    private pagerChunksRepository: Repository<PagerChunks>,
  ) {}

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
        totalChunks: chunks.length,
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
}
