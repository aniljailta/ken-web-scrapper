import { Controller, Get } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('scrape-products-pid-to-json')
  async scrapeProductsContent() {
    this.productsService.scrapeProductsContent();
    return { message: 'content scrapping started' };
  }

  @Get('scrape-products-pid-to-database')
  async readJsonFilesAndSave() {
    this.productsService.readJsonFilesAndSave();
    return { message: 'content scrapping started' };
  }

  @Get('scraping-logs')
  async scrapingLogs() {
    const { data, total } = await this.productsService.getScrapingLogs();
    return { message: 'Scraping Logs', data, total };
  }

  // @Post('product-query')
  // @UseGuards(LifetimeRequestGuard)
  // async queryFunctionCalling(@Body('question') question: string): Promise<{
  //   data: string | any[];
  //   isAIResponse: boolean;
  //   productData?: any;
  // }> {
  //   const { data, isAIResponse, productData } =
  //     await this.productsService.queryProduct({
  //       userQuery: question,
  //     });
  //   return { data, isAIResponse, productData };
  // }
}
