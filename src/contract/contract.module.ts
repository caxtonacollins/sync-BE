import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { LiquidityEventProcessorService } from './liquidity-event-processor.service';

@Module({
  controllers: [ContractController],
  providers: [ContractService, LiquidityEventProcessorService],
  exports: [ContractService, LiquidityEventProcessorService],
})
export class ContractModule {}
