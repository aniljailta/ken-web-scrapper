import { Controller, Post, Body, Get } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('query')
  async handleQuery(
    @Body('question') question: string,
  ): Promise<{ response: string }> {
    const response = await this.scraperService.getResponse(question);
    return { response };
  }

  @Get('scrape-data-to-database')
  async scapeToDataBase(): Promise<boolean> {
    const response = await this.scraperService.scapeToDataBase();
    return response;
  }
}
