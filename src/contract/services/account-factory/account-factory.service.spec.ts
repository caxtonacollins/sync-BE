import { Test, TestingModule } from '@nestjs/testing';
import { AccountFactoryService } from './account-factory.service';

describe('AccountFactoryService', () => {
  let service: AccountFactoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountFactoryService],
    }).compile();

    service = module.get<AccountFactoryService>(AccountFactoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
