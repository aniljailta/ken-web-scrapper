import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { SupportProductInternalContent } from './entities/internal_content.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, SupportProductInternalContent])],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
