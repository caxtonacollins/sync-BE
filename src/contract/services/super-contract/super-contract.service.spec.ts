import { Test, TestingModule } from '@nestjs/testing';
import { SuperContractService } from './super-contract.service';

describe('SuperContractService', () => {
  let service: SuperContractService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SuperContractService],
    }).compile();

    service = module.get<SuperContractService>(SuperContractService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
