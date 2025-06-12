import { Test, TestingModule } from '@nestjs/testing';
import { OnePagerService } from './one-pager.service';

describe('OnePagerService', () => {
  let service: OnePagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OnePagerService],
    }).compile();

    service = module.get<OnePagerService>(OnePagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
