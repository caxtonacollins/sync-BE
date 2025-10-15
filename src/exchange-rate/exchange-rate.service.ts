import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { ContractService } from '../contract/contract.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';

@Injectable()
export class ExchangeRateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: ContractService,
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  create(data: CreateExchangeRateDto) {
    return this.prisma.exchangeRate.create({ data });
  }

  async findAll() {
    // Get rates from database
    const syncRates = await this.prisma.exchangeRate.findMany();

    // Get Flutterwave rates (USD/NGN)
    const fwRates = await this.flutterwaveService.getExchangeRate(
      'USD',
      'NGN',
      100,
    );

    // Get token USD rates
    const tokenRates = await Promise.all([
      this.contractService.getTokenAmountInUsd(
        this.contractService.syncTokenAddress,
      ),
      this.contractService.getTokenAmountInUsd(
        this.contractService.strkTokenAddress,
      ),
      this.contractService.getTokenAmountInUsd(
        this.contractService.usdcTokenAddress,
      ),
      this.contractService.getTokenAmountInUsd(
        this.contractService.ethTokenAddress,
      ),
      this.contractService.getTokenAmountInUsd(
        this.contractService.btcTokenAddress,
      ),
    ]);

    // Combine all rates
    const exchangeRates = [
      ...syncRates,
      {
        fiatSymbol: 'NGN',
        tokenSymbol: 'USD',
        rate: Number(fwRates.rate),
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'SYNC',
        rate: Number(tokenRates[0]) / Math.pow(10, 18),
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'STRK',
        rate: Number(tokenRates[1]) / Math.pow(10, 18),
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'USDC',
        rate: Number(tokenRates[2]) / Math.pow(10, 6),
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'ETH',
        rate: Number(tokenRates[3]) / Math.pow(10, 18),
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'BTC',
        rate: Number(tokenRates[4]) / Math.pow(10, 18),
      },
    ];

    return exchangeRates;
  }

  findOne(fiatSymbol: string, tokenSymbol: string) {
    return this.prisma.exchangeRate.findUnique({
      where: { fiatSymbol_tokenSymbol: { fiatSymbol, tokenSymbol } },
    });
  }

  update(id: string, data: CreateExchangeRateDto) {
    return this.prisma.exchangeRate.update({
      where: { id },
      data,
    });
  }

  remove(id: string) {
    return this.prisma.exchangeRate.delete({ where: { id } });
  }
}
