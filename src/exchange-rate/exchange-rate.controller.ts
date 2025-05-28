import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { ExchangeRateFilterDto } from './dto/exchange-rate-filter.dto';

@Controller('exchange-rate')
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Post()
  create(@Body() dto: CreateExchangeRateDto) {
    return this.exchangeRateService.create(dto);
  }

  @Get()
  findAll(@Query() filter: ExchangeRateFilterDto) {
    return this.exchangeRateService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.exchangeRateService.findOne(id);
  }
}
