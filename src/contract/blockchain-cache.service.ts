import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * Blockchain Cache Service
 * Provides in-memory caching for blockchain data to reduce RPC calls
 * and improve performance
 */
@Injectable()
export class BlockchainCacheService {
  private readonly logger = new Logger(BlockchainCacheService.name);
  private cache = new Map<string, CacheEntry<any>>();
  
  // Default TTL values (in milliseconds)
  private readonly DEFAULT_TTL = 30000; // 30 seconds
  private readonly BALANCE_TTL = 10000; // 10 seconds for balances
  private readonly CONTRACT_DATA_TTL = 60000; // 1 minute for contract data
  private readonly EXCHANGE_RATE_TTL = 15000; // 15 seconds for exchange rates

  constructor() {
    // Clean up expired cache entries every minute
    setInterval(() => this.cleanupExpiredEntries(), 60000);
  }

  /**
   * Get cached data or return null if not found/expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.logger.debug(`Cache expired for key: ${key}`);
      return null;
    }

    this.logger.debug(`Cache hit for key: ${key}`);
    return entry.data as T;
  }

  /**
   * Set cached data with custom or default TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL,
    };

    this.cache.set(key, entry);
    this.logger.debug(`Cache set for key: ${key}, TTL: ${entry.ttl}ms`);
  }

  /**
   * Cache token balance with appropriate TTL
   */
  setBalance(address: string, symbol: string, balance: any): void {
    const key = `balance:${address}:${symbol}`;
    this.set(key, balance, this.BALANCE_TTL);
  }

  /**
   * Get cached token balance
   */
  getBalance(address: string, symbol: string): any | null {
    const key = `balance:${address}:${symbol}`;
    return this.get(key);
  }

  /**
   * Cache contract data (ABI, class, etc.)
   */
  setContractData(contractAddress: string, dataType: string, data: any): void {
    const key = `contract:${contractAddress}:${dataType}`;
    this.set(key, data, this.CONTRACT_DATA_TTL);
  }

  /**
   * Get cached contract data
   */
  getContractData(contractAddress: string, dataType: string): any | null {
    const key = `contract:${contractAddress}:${dataType}`;
    return this.get(key);
  }

  /**
   * Cache exchange rate
   */
  setExchangeRate(from: string, to: string, rate: number): void {
    const key = `rate:${from}:${to}`;
    this.set(key, rate, this.EXCHANGE_RATE_TTL);
  }

  /**
   * Get cached exchange rate
   */
  getExchangeRate(from: string, to: string): number | null {
    const key = `rate:${from}:${to}`;
    return this.get(key);
  }

  /**
   * Invalidate specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    this.logger.debug(`Cache invalidated for key: ${key}`);
  }

  /**
   * Invalidate all balances for a specific address
   */
  invalidateBalances(address: string): void {
    const prefix = `balance:${address}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    this.logger.debug(`All balances invalidated for address: ${address}`);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.logger.log('Cache cleared');
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.logger.debug(`Cleaned up ${expiredCount} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
