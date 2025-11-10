import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { PragmaService } from './pragma.service';
import axios from 'axios';
import { LiquidityPoolContractService } from 'src/contract/services/liquidity-pool/liquidity-pool.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';

@Injectable()
export class ExchangeRateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: LiquidityPoolContractService,
    private readonly tokenContractService: TokenContractService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly pragmaService: PragmaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  create(data: CreateExchangeRateDto) {
    return this.prisma.exchangeRate.create({ data });
  }

  private readonly CACHE_TTL_MS = 60000;
  private readonly CACHE_KEY = 'exchange-rates';
  private lastFetchTime: number = 0;
  private lastCachedRates: any = null;

  async getExchangeRates() {
    const now = Date.now();
    
    // Return in-memory cache if available and not expired
    if (this.lastCachedRates && (now - this.lastFetchTime < this.CACHE_TTL_MS)) {
      return this.lastCachedRates;
    }

    try {
      const cachedRates = await this.cacheManager.get(this.CACHE_KEY);
      if (cachedRates) {
        this.lastCachedRates = cachedRates;
        this.lastFetchTime = now;
        return cachedRates;
      }
    } catch (error) {
      console.error('Error reading from cache:', error);
      // Continue to fetch fresh data if cache read fails
    }

    try {
      const [syncRates, fwRates, syncUsdRate] = await Promise.all([
        this.prisma.exchangeRate.findMany(),
        this.flutterwaveService.getExchangeRate('NGN', 'USD', 100),
        this.contractService.getTokenAmountInUsd(this.tokenContractService.syncTokenAddress),
      ]);

      const pragmaPairs = ['STRK/USD', 'USDC/USD', 'ETH/USD', 'BTC/USD'];
      const [strkUsdRate, usdcUsdRate, ethUsdRate, btcUsdRate] = this.pragmaService.getRates(pragmaPairs);

      // Combine all rates
      const exchangeRates = [
        ...syncRates,
        {
          fiatSymbol: 'NGN',
          tokenSymbol: 'USD',
          rate: Number(fwRates.rate),
          updatedAt: new Date().toISOString(),
        },
        {
          fiatSymbol: 'USD',
          tokenSymbol: 'SYNC',
          rate: Number(syncUsdRate) / Math.pow(10, 18),
          updatedAt: new Date().toISOString(),
        },
        {
          fiatSymbol: 'USD',
          tokenSymbol: 'STRK',
          rate: strkUsdRate || 0,
          updatedAt: new Date().toISOString(),
        },
        {
          fiatSymbol: 'USD',
          tokenSymbol: 'USDC',
          rate: usdcUsdRate || 0,
          updatedAt: new Date().toISOString(),
        },
        {
          fiatSymbol: 'USD',
          tokenSymbol: 'ETH',
          rate: ethUsdRate || 0,
          updatedAt: new Date().toISOString(),
        },
        {
          fiatSymbol: 'USD',
          tokenSymbol: 'BTC',
          rate: btcUsdRate || 0,
          updatedAt: new Date().toISOString(),
        },
      ];

      // Update in-memory cache
      this.lastCachedRates = exchangeRates;
      this.lastFetchTime = now;

      // Update Redis cache in background
      this.cacheManager.set(this.CACHE_KEY, exchangeRates, this.CACHE_TTL_MS / 1000)
        .catch(error => console.error('Error writing to cache:', error));

      return exchangeRates;
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      // If we have stale data, return it with a warning
      if (this.lastCachedRates) {
        console.warn('Returning stale exchange rate data due to error');
        return this.lastCachedRates;
      }
      throw error;
    }
  }

  // async getExchangeRates() {
  //   const syncRates = await this.prisma.exchangeRate.findMany();

  //   const fwRates = await this.flutterwaveService.getExchangeRate(
  //     'NGN',
  //     'USD',
  //     1
  //   );

  //   const coinIds = 'starknet,ethereum,usd-coin,bitcoin';

  //   const tokenRatesResponse = await axios.get(
  //     `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`
  //   );

  //   const { data: tokenPrices } = tokenRatesResponse;

  //   const syncPrice = tokenPrices.sync?.usd || 0;

  //   // Combine all rates
  //   const exchangeRates = [
  //     ...syncRates,
  //     {
  //       fiatSymbol: 'NGN',
  //       tokenSymbol: 'USD',
  //       rate: Number(fwRates.rate),
  //     },
  //     {
  //       fiatSymbol: 'USD',
  //       tokenSymbol: 'SYNC',
  //       rate: syncPrice, // CoinGecko price or 0 if not available
  //     },
  //     {
  //       fiatSymbol: 'USD',
  //       tokenSymbol: 'STRK',
  //       rate: tokenPrices.starknet?.usd || 0,
  //     },
  //     {
  //       fiatSymbol: 'USD',
  //       tokenSymbol: 'USDC',
  //       rate: tokenPrices['usd-coin']?.usd || 0,
  //     },
  //     {
  //       fiatSymbol: 'USD',
  //       tokenSymbol: 'ETH',
  //       rate: tokenPrices.ethereum?.usd || 0,
  //     },
  //     {
  //       fiatSymbol: 'USD',
  //       tokenSymbol: 'BTC',
  //       rate: tokenPrices.bitcoin?.usd || 0,
  //     },
  //   ];

  //   return exchangeRates;
  // }

  async getExchangeRateFor(symbols: string[]) {
    const symbolToCoinGeckoId: Record<string, string> = {
      strk: 'starknet',
      eth: 'ethereum',
      usdc: 'usd-coin',
      btc: 'bitcoin',
    };

    const rates: Record<string, number> = {};

    // Separate crypto and fiat symbols
    const cryptoSymbols = symbols.filter(s => symbolToCoinGeckoId[s.toLowerCase()]);
    const fiatSymbols = symbols.filter(s => !symbolToCoinGeckoId[s.toLowerCase()]);

    // Fetch crypto rates from CoinGecko
    if (cryptoSymbols.length > 0) {
      const coinIds = cryptoSymbols
        .map(symbol => symbolToCoinGeckoId[symbol.toLowerCase()])
        .join(',');

      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`
      );

      const { data: tokenPrices } = response;

      for (const symbol of cryptoSymbols) {
        const coinId = symbolToCoinGeckoId[symbol.toLowerCase()];
        if (tokenPrices[coinId]?.usd) {
          rates[symbol.toLowerCase()] = tokenPrices[coinId].usd;
        }
      }
    }

    // Fetch fiat rates (NGN, etc.)
    for (const symbol of fiatSymbols) {
      if (symbol.toLowerCase() === 'ngn') {
        const fwRates = await this.flutterwaveService.getExchangeRate('NGN', 'USD', 1);
        rates.ngn = Number(fwRates.rate);
      }
      // Add other fiat currencies as needed
    }

    return rates;
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
