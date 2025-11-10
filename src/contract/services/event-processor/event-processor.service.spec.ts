import { Test, TestingModule } from '@nestjs/testing';
import { LiquidityEventProcessorService } from './event-processor.service';

describe('EventProcessorService', () => {
  let service: LiquidityEventProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LiquidityEventProcessorService],
    }).compile();

    service = module.get<LiquidityEventProcessorService>(LiquidityEventProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
