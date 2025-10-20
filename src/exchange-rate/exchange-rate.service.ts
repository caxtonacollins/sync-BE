import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { ContractService } from '../contract/contract.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import axios from 'axios';

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

  async getExchangeRates() {
    // Get rates from database
    const syncRates = await this.prisma.exchangeRate.findMany();

    // Get Flutterwave rates (USD/NGN)
    const fwRates = await this.flutterwaveService.getExchangeRate(
      'NGN',
      'USD',
      1
    );

    // CoinGecko coin IDs for tokens
    const coinIds = 'starknet,ethereum,usd-coin,bitcoin';

    // Fetch all token prices in a single API call (more efficient)
    const tokenRatesResponse = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`
    );

    const { data: tokenPrices } = tokenRatesResponse;

    // Note: SYNC token might not be available on CoinGecko
    // Using a placeholder of 0 if not found
    const syncPrice = tokenPrices.sync?.usd || 0;

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
        rate: syncPrice, // CoinGecko price or 0 if not available
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'STRK',
        rate: tokenPrices.starknet?.usd || 0,
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'USDC',
        rate: tokenPrices['usd-coin']?.usd || 0,
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'ETH',
        rate: tokenPrices.ethereum?.usd || 0,
      },
      {
        fiatSymbol: 'USD',
        tokenSymbol: 'BTC',
        rate: tokenPrices.bitcoin?.usd || 0,
      },
    ];

    return exchangeRates;
  }

  findOne(fiatSymbol: string, tokenSymbol: string) {
    return this.prisma.exchangeRate.findUnique({
      where: { fiatSymbol_tokenSymbol: { fiatSymbol, tokenSymbol } },
      select: {
        id: true,
        fiatSymbol: true,
        tokenSymbol: true,
        rate: true,
      },
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
