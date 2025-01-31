import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { SupportProductInternalContent } from './entities/internal_content.entity';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, SupportProductInternalContent]),
    UsersModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, UsersModule],
})
export class ProductsModule {}
