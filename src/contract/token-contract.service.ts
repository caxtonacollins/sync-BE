import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RpcProvider, uint256, CallData } from 'starknet';
import { connectToStarknet, createNewContractInstance } from './utils';
import erc20 from './abi/erc20.json';
import { TokenBalance } from '../types';

@Injectable()
export class TokenContractService {
  private provider: RpcProvider;
  private readonly _syncTokenAddress: string;
  private readonly _strkTokenAddress: string;
  private readonly _usdcTokenAddress: string;
  private readonly _ethTokenAddress: string;
  private readonly _btcTokenAddress: string;

  private readonly tokenAddressMap: Record<string, string>;
  private readonly decimalsMap: Record<string, number>;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    this.provider = connectToStarknet();
    this._syncTokenAddress = process.env.SYNC_TOKEN_ADDRESS || '';
    this._strkTokenAddress = process.env.STRK_TOKEN_ADDRESS || '';
    this._usdcTokenAddress = process.env.USDC_TOKEN_ADDRESS || '';
    this._ethTokenAddress = process.env.ETH_TOKEN_ADDRESS || '';
    this._btcTokenAddress = process.env.BTC_TOKEN_ADDRESS || '';

    this.tokenAddressMap = {
      SYNC: this._syncTokenAddress,
      STRK: this._strkTokenAddress,
      USDC: this._usdcTokenAddress,
      ETH: this._ethTokenAddress,
      BTC: this._btcTokenAddress,
    };

    this.decimalsMap = {
      SYNC: 18,
      STRK: 18,
      USDC: 6,
      ETH: 18,
      BTC: 18,
    };
  }

  get syncTokenAddress(): string {
    return this._syncTokenAddress;
  }

  get strkTokenAddress(): string {
    return this._strkTokenAddress;
  }

  get usdcTokenAddress(): string {
    return this._usdcTokenAddress;
  }

  get ethTokenAddress(): string {
    return this._ethTokenAddress;
  }

  get btcTokenAddress(): string {
    return this._btcTokenAddress;
  }

  /**
   * Get token balance for a specific address with Redis caching
   */
  async getAccountBalance(symbol: string, userAddress: string): Promise<TokenBalance> {
    if (!symbol) throw new Error('symbol is required');
    if (!userAddress) throw new Error('userAddress is required');

    // Check Redis cache first
    const cacheKey = `balance:${userAddress}:${symbol}`;
    const cachedBalance = await this.cacheManager.get(cacheKey);
    if (cachedBalance) {
      console.log(`[Cache Hit] Balance for ${symbol} at ${userAddress}`);
      return cachedBalance as TokenBalance;
    }

    const tokenAddress = this.tokenAddressMap[symbol.toUpperCase()];
    if (!tokenAddress) {
      throw new Error(`Token with symbol ${symbol} not supported`);
    }

    try {
      const tokenContract = createNewContractInstance(erc20, tokenAddress);
      const balance = await tokenContract.balance_of(userAddress);
      const decimals = this.decimalsMap[symbol.toUpperCase()] || 18;

      // Convert from smallest unit to human-readable format
      const balanceFormatted = Number(balance) / Math.pow(10, decimals);

      const result = {
        raw: balance.toString(),
        formatted: balanceFormatted.toString(),
        symbol: symbol.toUpperCase(),
        decimals: decimals,
      };

      // Cache the result in Redis (TTL: 30 seconds)
      await this.cacheManager.set(cacheKey, result, 30000);

      return result;
    } catch (error) {
      console.error(
        `Error fetching balance for ${symbol} for account ${userAddress}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Batch fetch multiple token balances for a single address
   */
  async getMultipleAccountBalances(symbols: string[], userAddress: string): Promise<TokenBalance[]> {
    if (!symbols || symbols.length === 0)
      throw new Error('symbols array is required');
    if (!userAddress) throw new Error('userAddress is required');

    const balancePromises = symbols.map((symbol) =>
      this.getAccountBalance(symbol, userAddress).catch((error) => {
        console.error(
          `Error fetching balance for ${symbol} for account ${userAddress}:`,
          error,
        );
        return null;
      }),
    );

    const results = await Promise.all(balancePromises);
    return results.filter((result) => result !== null);
  }

  /**
   * Get SYNC token balance (legacy method)
   */
  async getSyncTokenBalance(address: string) {
    if (!address) throw new Error('user address is required');
    return this.getAccountBalance('SYNC', address);
  }

  /**
   * Generate approve token calldata
   */
  getApproveTokenCalldata(
    tokenSymbol: string,
    spenderAddress: string,
    amount: string,
  ) {
    const token = tokenSymbol.toUpperCase();
    const tokenAddress = this.tokenAddressMap[token];

    if (!tokenAddress) {
      throw new Error(`Token ${token} not supported`);
    }

    const decimals = this.decimalsMap[token] || 18;
    const adjustedAmount = BigInt(
      Math.floor(Number(amount) * Math.pow(10, decimals)),
    );
    const amountU256 = uint256.bnToUint256(adjustedAmount);

    return {
      contractAddress: tokenAddress,
      entrypoint: 'approve',
      calldata: [spenderAddress, amountU256.low, amountU256.high],
    };
  }

  /**
   * Get token address by symbol
   */
  getTokenAddress(symbol: string): string {
    const tokenAddress = this.tokenAddressMap[symbol.toUpperCase()];
    if (!tokenAddress) {
      throw new Error(`Token with symbol ${symbol} not supported`);
    }
    return tokenAddress;
  }

  /**
   * Get token decimals by symbol
   */
  getTokenDecimals(symbol: string): number {
    return this.decimalsMap[symbol.toUpperCase()] || 18;
  }

  /**
   * Invalidate cache for a specific user and token
   */
  async invalidateBalanceCache(userAddress: string, symbol: string) {
    const cacheKey = `balance:${userAddress}:${symbol}`;
    await this.cacheManager.del(cacheKey);
  }

  /**
   * Invalidate all balance caches for a user
   */
  async invalidateAllBalanceCaches(userAddress: string) {
    const symbols = Object.keys(this.tokenAddressMap);
    await Promise.all(
      symbols.map((symbol) => this.invalidateBalanceCache(userAddress, symbol)),
    );
  }
}
