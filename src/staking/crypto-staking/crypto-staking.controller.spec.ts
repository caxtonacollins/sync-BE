import { Test, TestingModule } from '@nestjs/testing';
import { CryptoStakingController } from './crypto-staking.controller';

describe('CryptoStakingController', () => {
  let controller: CryptoStakingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CryptoStakingController],
    }).compile();

    controller = module.get<CryptoStakingController>(CryptoStakingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
