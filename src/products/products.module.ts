import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { SupportProductInternalContent } from './entities/internal_content.entity';
import { UsersModule } from 'src/users/users.module';
import { RequestTrackerService } from 'src/request-tracker/request-tracker.service';
import { RequestTracker } from 'src/request-tracker/entities/request_tracker.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      SupportProductInternalContent,
      RequestTracker,
    ]),
    UsersModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, UsersModule, RequestTrackerService],
  exports: [ProductsService],
})
export class ProductsModule {}
