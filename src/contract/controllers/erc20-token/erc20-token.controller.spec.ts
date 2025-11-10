import { Test, TestingModule } from '@nestjs/testing';
import { Erc20TokenController } from './erc20-token.controller';

describe('Erc20TokenController', () => {
  let controller: Erc20TokenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Erc20TokenController],
    }).compile();

    controller = module.get<Erc20TokenController>(Erc20TokenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
