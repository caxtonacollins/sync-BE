import { Controller, Get } from '@nestjs/common';
import { SyncPayService } from './syncpay.service';

@Controller('syncpay')
export class SyncPayController {
  constructor(private readonly syncPayService: SyncPayService) {}

  @Get('stats')
  getStats() {
    return this.syncPayService.getStats();
  }
}
