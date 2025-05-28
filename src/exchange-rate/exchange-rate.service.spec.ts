import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeRateService } from './exchange-rate.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateService,
        { provide: PrismaService, useValue: {} }, // Mock PrismaService
      ],
    }).compile();

    service = module.get<ExchangeRateService>(ExchangeRateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
