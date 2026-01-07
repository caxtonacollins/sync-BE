import { Body, Controller, Post } from '@nestjs/common';
import { LiquidityEventProcessorService } from 'src/contract/services/event-processor/event-processor.service';

// Alias controller to accept indexer posts at /contract/events
@Controller('contract')
export class ContractEventsController {
  constructor(
    private readonly liquidityEventProcessorService: LiquidityEventProcessorService,
  ) {}

  @Post('events')
  async handleContractEvent(@Body() eventPayload: any) {
    return await this.liquidityEventProcessorService.process(eventPayload);
  }
}
