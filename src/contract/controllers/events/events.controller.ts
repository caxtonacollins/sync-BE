import { Body, Controller, Post } from '@nestjs/common';
import { LiquidityEventProcessorService } from 'src/contract/services/event-processor/event-processor.service';

@Controller('events')
export class EventsController {
    constructor(private readonly liquidityEventProcessorService: LiquidityEventProcessorService) {}

    @Post('events')
    async handleContractEvent(@Body() eventPayload: any) {
      return await this.liquidityEventProcessorService.process(eventPayload);
    }
}
