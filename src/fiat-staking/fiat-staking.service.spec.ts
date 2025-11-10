import { Test, TestingModule } from '@nestjs/testing';
import { FiatStakingService } from './fiat-staking.service';

describe('FiatStakingService', () => {
  let service: FiatStakingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FiatStakingService],
    }).compile();

    service = module.get<FiatStakingService>(FiatStakingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
