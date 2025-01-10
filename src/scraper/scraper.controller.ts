import { Controller, Post, Body, Get } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ECommerceService } from './ecommerce.services';

@Controller('scraper')
export class ScraperController {
  constructor(
    private readonly scraperService: ScraperService,
    private readonly eCommerceService: ECommerceService,
  ) {}

  // @Post('query')
  // async handleQuery(
  //   @Body('question') question: string,
  // ): Promise<{ response: string }> {
  //   const response = await this.scraperService.getResponse(question);
  //   return { response };
  // }

  // To ask the AI assistant about the product
  @Post('product-query')
  async queryFunctionCalling(
    @Body('question') question: string,
    @Body('password') password: string,
  ): Promise<{ response: string }> {
    const response = await this.scraperService.queryProduct(question, password);
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

  // To scrape the internal links data from file products-list.json
  @Get('scrape-products-pid-to-json')
  async scrapeProductsContent() {
    this.scraperService.scrapeProductsContent();
    return { message: 'content scrapping started' };
  }

  // To add the internal links data from folder products-category to database
  @Get('scrape-products-pid-to-database')
  async readJsonFilesAndSave() {
    this.scraperService.readJsonFilesAndSave();
    return { message: 'content to add in DB started' };
  }

  // To scrape the whole content data from url
  @Post('scrape-content-based-on-url')
  async scrapeContentBasedOnUrl(@Body('link') link: string) {
    const content = await this.scraperService.scrapeContentBasedOnUrl(link);
    return { content };
  }

  // To get response of product based on name or pid
  @Post('get-product-data')
  async getProductData(@Body('name') name: string): Promise<{ response: any }> {
    if (!name) {
      return { response: 'Please provide product name' };
    }
    const response = await this.scraperService.getProductData(name);
    return { response };
  }

  // @Get('matchString')
  // async matchString() {
  //   return await this.eCommerceService.matchString();
  // }

  // To scrape orm cisco product website

  @Get('ormProductList')
  async scrapeProductDataOfORMWebsite() {
    this.eCommerceService.scrapeProductDataOfORMWebsite();
    return { message: 'scrapping started' };
  }

  // To scrape insight cisco product website

  @Get('itPriceProductList')
  async scrapeProductDataOfITPriceWebsite() {
    this.eCommerceService.scrapeProductDataOfITPriceWebsite();

    return { message: 'scrapping started' };
  }

  // To scrape the pid data from url
  @Post('scrapeFromUrl')
  async scrapeFromUrl(@Body('link') link: string) {
    const content = await this.eCommerceService.scrapeContentBasedOnUrl(link);
    return { content };
  }
}
