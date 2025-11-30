import { Test, TestingModule } from '@nestjs/testing';
import { FiatStakingController } from './fiat-staking.controller';

describe('FiatStakingController', () => {
  let controller: FiatStakingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FiatStakingController],
    }).compile();

    controller = module.get<FiatStakingController>(FiatStakingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
