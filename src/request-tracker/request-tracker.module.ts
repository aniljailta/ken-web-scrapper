import { Module } from '@nestjs/common';
import { RequestTrackerService } from './request-tracker.service';
import { RequestTracker } from './entities/request_tracker.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([RequestTracker])],
  providers: [RequestTrackerService],
  exports: [RequestTrackerService],
})
export class RequestTrackerModule {}
