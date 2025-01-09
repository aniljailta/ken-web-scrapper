import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperData } from './entities/scraper_data.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScraperController } from './scraper.controller';
import { AdditionalData } from './entities/additional_data.entity';
import { InternalContent } from './entities/internal_content.entity';
import { ECommerceService } from './ecommerce.services';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScraperData, AdditionalData, InternalContent]),
  ],
  providers: [ScraperService, ECommerceService],
  controllers: [ScraperController],
})
export class ScraperModule {}
