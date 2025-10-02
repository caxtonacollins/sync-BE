import { Module } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { EventListenerClientService } from './event-listener-client.service';
import { ContractEventHandlerService } from './contract-event-handler.service';

@Module({
  controllers: [ContractController],
  providers: [
    ContractService,
    EventListenerClientService,
    ContractEventHandlerService,
  ],
  exports: [
    ContractService,
    EventListenerClientService,
    ContractEventHandlerService,
  ],
})
export class ContractModule {}
