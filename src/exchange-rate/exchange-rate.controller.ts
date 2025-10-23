import { Controller, Get, Param } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';

@Controller('exchange-rate')
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Get()
  findAll() {
    return this.exchangeRateService.getExchangeRates();
  }

  @Get('pair')
  async findOne(
    @Param('fiatSymbol') fiatSymbol: string, 
    @Param('tokenSymbol') tokenSymbol: string
  ) {
    const rate = await this.exchangeRateService.findOne(fiatSymbol, tokenSymbol);
    if (!rate) {
      return null;
    }
    return rate;
  }
}
