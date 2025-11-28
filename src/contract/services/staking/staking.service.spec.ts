import { Test, TestingModule } from '@nestjs/testing';
import { StakingContractService } from './staking.service';

describe('StakingContractService', () => {
  let service: StakingContractService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StakingContractService],
    }).compile();

    service = module.get<StakingContractService>(StakingContractService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
