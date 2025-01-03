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

  @Post('product-query')
  async queryFunctionCalling(
    @Body('question') question: string,
  ): Promise<{ response: string }> {
    const response = await this.scraperService.queryProduct(question);
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
  @Get('scrape-support-product-links')
  async scrapeSupportProductsDataLinks() {
    this.scraperService.scrapeSupportProductsDataLinks();
    return { message: 'scrapping started' };
  }

  // // To merge the product data from products-list.json file to additional-products-list
  // @Get('merge-all-products')
  // async mergeAllProducts() {
  //   return await this.scraperService.mergeAllProducts();
  // }

  // To scrape the internal links data from file additional-products-list
  @Get('scrape-products-content')
  async scrapeProductsContent() {
    this.scraperService.scrapeProductsContent();
    return { message: 'content scrapping started' };
  }

  @Get('additional-scrape-data-to-database')
  async readJsonFilesAndSave() {
    this.scraperService.readJsonFilesAndSave();
    return { message: 'content to add in DB started' };
  }

  @Post('scrape-content-based-on-url')
  async scrapeContentBasedOnUrl(@Body('link') link: string) {
    const content = await this.scraperService.scrapeContentBasedOnUrl(link);
    return { content };
  }

  @Post('getProductData')
  async getProductData(@Body('name') name: string): Promise<{ response: any }> {
    if (!name) {
      return { response: 'Please provide product name' };
    }
    const response = await this.scraperService.getProductData(name);
    return { response };
  }

  // @Get('matchString')
  // async matchString() {
  //   return await this.scraperService.matchString();
  // }
}
