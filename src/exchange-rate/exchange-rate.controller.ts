import { Controller, Get, Param } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';

@Controller('exchange-rate')
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Get()
  findAll() {
    return this.exchangeRateService.findAll();
  }

  @Get(':fiatSymbol/:tokenSymbol')
  findOne(@Param('fiatSymbol') fiatSymbol: string, @Param('tokenSymbol') tokenSymbol: string) {
    return this.exchangeRateService.findOne(fiatSymbol, tokenSymbol);
  }
}
