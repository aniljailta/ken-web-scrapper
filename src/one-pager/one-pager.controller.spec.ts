import { Test, TestingModule } from '@nestjs/testing';
import { OnePagerController } from './one-pager.controller';

describe('OnePagerController', () => {
  let controller: OnePagerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnePagerController],
    }).compile();

    controller = module.get<OnePagerController>(OnePagerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
