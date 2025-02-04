import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestTracker } from './entities/request_tracker.entity';

@Injectable()
export class RequestTrackerService {
  constructor(
    @InjectRepository(RequestTracker)
    private readonly requestTrackerRepository: Repository<RequestTracker>,
  ) {}

  async trackRequest(ip: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
    let tracker = await this.requestTrackerRepository.findOne({
      where: { ip },
    });

    if (!tracker) {
      // Create a new tracker if it doesn't exist
      tracker = this.requestTrackerRepository.create({
        ip,
        requestCount: 0,
        lastRequestDate: today,
      });
    } else {
      // Ensure lastRequestDate is a Date object
      if (!(tracker.lastRequestDate instanceof Date)) {
        tracker.lastRequestDate = new Date(tracker.lastRequestDate);
      }

      // Reset the count if the last request was on a different day
      const lastRequestDate = tracker.lastRequestDate
        .toISOString()
        .split('T')[0];
      if (lastRequestDate !== today) {
        tracker.requestCount = 0;
        tracker.lastRequestDate = new Date(today); // Ensure it's a Date object
      }
    }

    // Increment the request count
    tracker.requestCount += 1;
    await this.requestTrackerRepository.save(tracker);

    return tracker.requestCount;
  }

  async getRequestCount(ip: string): Promise<number> {
    const tracker = await this.requestTrackerRepository.findOne({
      where: { ip },
    });
    const today = new Date().toISOString().split('T')[0];

    // Return 0 if the last request was on a different day
    if (!tracker || !tracker.lastRequestDate) {
      return 0;
    }

    // Ensure lastRequestDate is a Date object
    if (!(tracker.lastRequestDate instanceof Date)) {
      tracker.lastRequestDate = new Date(tracker.lastRequestDate);
    }

    const lastRequestDate = tracker.lastRequestDate.toISOString().split('T')[0];
    if (lastRequestDate !== today) {
      return 0;
    }

    return tracker.requestCount;
  }
}
