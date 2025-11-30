import { Test, TestingModule } from '@nestjs/testing';
import { MonnifyService } from './monnify.service';

describe('MonnifyService', () => {
  let service: MonnifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MonnifyService],
    }).compile();

    service = module.get<MonnifyService>(MonnifyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
