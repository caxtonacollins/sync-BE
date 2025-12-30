import { Test, TestingModule } from '@nestjs/testing';
import { AccountContractService } from './account.service';

describe('AccountContractService', () => {
  let service: AccountContractService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountContractService,
        {
          provide: 'PrismaService',
          useValue: {}, // Mock PrismaService
        },
      ],
    }).compile();

    service = module.get<AccountContractService>(AccountContractService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
