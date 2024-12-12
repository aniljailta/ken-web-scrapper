import { Controller, Post, Body } from '@nestjs/common';
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
}
