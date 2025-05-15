import { Test, TestingModule } from '@nestjs/testing';
import { ChatwidgetService } from './chatWidget.service';

describe('ChatwidgetService', () => {
  let service: ChatwidgetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatwidgetService],
    }).compile();

    service = module.get<ChatwidgetService>(ChatwidgetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
