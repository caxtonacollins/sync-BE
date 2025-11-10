import { Test, TestingModule } from '@nestjs/testing';
import { CryptoStakingService } from './crypto-staking.service';

describe('CryptoStakingService', () => {
  let service: CryptoStakingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoStakingService],
    }).compile();

    service = module.get<CryptoStakingService>(CryptoStakingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
