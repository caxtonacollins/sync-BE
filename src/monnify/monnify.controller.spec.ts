import { Test, TestingModule } from '@nestjs/testing';
import { MonnifyController } from './monnify.controller';

describe('MonnifyController', () => {
  let controller: MonnifyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MonnifyController],
    }).compile();

    controller = module.get<MonnifyController>(MonnifyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
