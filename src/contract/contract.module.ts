import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { EventListenerClientService } from './event-listener-client.service';
import { ContractEventHandlerService } from './contract-event-handler.service';
import { LiquidityEventProcessorService } from './liquidity-event-processor.service';

@Module({
  controllers: [ContractController],
  providers: [
    ContractService,
    EventListenerClientService,
    ContractEventHandlerService,
    LiquidityEventProcessorService,
  ],
  exports: [
    ContractService,
    EventListenerClientService,
    ContractEventHandlerService,
    LiquidityEventProcessorService,
  ],
})
export class ContractModule {}
