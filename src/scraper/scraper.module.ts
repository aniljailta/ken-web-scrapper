import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperData } from './entities/scraper_data.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScraperController } from './scraper.controller';

import { InternalContent } from './entities/internal_content.entity';
import { ECommerceService } from './ecommerce.services';
import { SupportProductData } from './entities/support_product_data.entity';
import { ScrapingLogs } from 'src/products/entities/scraping-logs.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScraperData,
      SupportProductData,
      InternalContent,
      ScrapingLogs,
    ]),
  ],
  providers: [ScraperService, ECommerceService],
  controllers: [ScraperController],
})
export class ScraperModule {}
