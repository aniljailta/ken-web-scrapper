import { Module } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperData } from './entities/scraper_data.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScraperController } from './scraper.controller';
import { AdditionalData } from './entities/additional_data.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ScraperData, AdditionalData])],
  providers: [ScraperService],
  controllers: [ScraperController],
})
export class ScraperModule {}
