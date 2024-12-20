import { Controller, Post, Body, Get } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  // To ask the AI assistant about the product
  @Post('query')
  async handleQuery(
    @Body('question') question: string,
  ): Promise<{ response: string }> {
    const response = await this.scraperService.getResponse(question);
    return { response };
  }

  // To scrape the product data to product.json
  @Get('scrape-data-to-json')
  async scapeToJsonFile(): Promise<any> {
    await this.scraperService.scapeToJsonFile();
    return { message: 'scrapping started' };
  }

  // To scrape the product data from product.json to database
  @Get('scrape-data-to-database')
  async scapeToDataBase(): Promise<boolean> {
    const response = await this.scraperService.scapeToDataBase();
    return response;
  }
  // To scrape the product data to products-list.json
  @Get('scrape-new-data')
  async scrapeData() {
    this.scraperService.scrapeData();
    return { message: 'scrapping started' };
  }

  // To merge the product data from products-list.json file to additional-products-list
  @Get('merge-all-products')
  async mergeAllProducts() {
    return await this.scraperService.mergeAllProducts();
  }

  // To scrape the internal links data from file additional-products-list
  @Get('scrape-products-content')
  async scrapeProductsContent() {
    await this.scraperService.scrapeProductsContent();
    return { message: 'content scrapping started' };
  }
}
