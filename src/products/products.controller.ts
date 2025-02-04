import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { LifetimeRequestGuard } from 'src/guards/lifetime-request.guard';

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

  @Post('product-query')
  @UseGuards(LifetimeRequestGuard)
  async queryFunctionCalling(
    @Body('question') question: string,
    @Body('password') password: string,
  ): Promise<{
    data: string | any[];
    isAIResponse: boolean;
    productData?: any;
  }> {
    const { data, isAIResponse, productData } =
      await this.productsService.queryProduct(question, password);
    return { data, isAIResponse, productData };
  }
}
