import { Test, TestingModule } from '@nestjs/testing';
import { ChatwidgetController } from './chatWidget.controller';

describe('ChatwidgetController', () => {
  let controller: ChatwidgetController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatwidgetController],
    }).compile();

    controller = module.get<ChatwidgetController>(ChatwidgetController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
