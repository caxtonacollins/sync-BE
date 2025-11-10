import { Test, TestingModule } from '@nestjs/testing';
import { Erc20TokenService } from './erc20-token.service';

describe('Erc20TokenService', () => {
  let service: Erc20TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Erc20TokenService],
    }).compile();

    service = module.get<Erc20TokenService>(Erc20TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
