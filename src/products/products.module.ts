import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { SupportProductInternalContent } from './entities/internal_content.entity';
import { UsersModule } from 'src/users/users.module';
import { RequestTrackerService } from 'src/request-tracker/request-tracker.service';
import { RequestTracker } from 'src/request-tracker/entities/request_tracker.entity';
import { ScrapingLogs } from './entities/scraping-logs.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      SupportProductInternalContent,
      RequestTracker,
      ScrapingLogs,
    ]),
    UsersModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, UsersModule, RequestTrackerService],
  exports: [ProductsService],
})
export class ProductsModule {}
