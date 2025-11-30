import { Injectable } from '@nestjs/common';
import { CryptoStakingService } from 'src/staking/crypto-staking/crypto-staking.service';
import { FiatStakingService } from 'src/staking/fiat-staking/fiat-staking.service';
import { ExchangeRateService } from 'src/transaction/exchange-rate-and-pragma/exchange-rate.service';
import { Stake } from 'src/types';

@Injectable()
export class StakingService {
  constructor(
    private readonly cryptoStakingService: CryptoStakingService,
    private readonly fiatStakingService: FiatStakingService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async getStakingSummary(userId: string) {
    const allStakes = await this.getAllUserStakes(userId);

    if (allStakes.length === 0) {
      return {
        totalStakedValueUsd: 0,
        totalRewardsValueUsd: 0,
        averageApy: 0,
        stakeCount: 0,
      };
    }

    let totalStakedValueUsd = 0;
    let totalRewardsValueUsd = 0;
    let weightedApySum = 0;

    for (const stake of allStakes) {
      const currency =
        stake.type === 'CRYPTO' ? stake.tokenSymbol : stake.currency;
      const rates = await this.exchangeRateService.getExchangeRateFor([
        currency,
      ]);
      const rate = rates[currency] || 0;
      const stakeValueUsd = Number(stake.amount) * Number(rate);

      totalStakedValueUsd += stakeValueUsd;
      totalRewardsValueUsd += (stake.pendingRewards || 0) * Number(rate);
      weightedApySum += stakeValueUsd * (stake.apyBps / 10000);
    }

    const averageApy =
      totalStakedValueUsd > 0
        ? (weightedApySum / totalStakedValueUsd) * 100
        : 0;

    return {
      totalStakedValueUsd,
      totalRewardsValueUsd,
      averageApy,
      stakeCount: allStakes.length,
    };
  }

  async getAllUserStakes(userId: string): Promise<Stake[]> {
    const cryptoStakes = await this.cryptoStakingService.getUserStakes(userId);
    const fiatStakes = await this.fiatStakingService.getUserStakes(userId);

    const formattedCryptoStakes = cryptoStakes.map((stake) => ({
      ...stake,
      type: 'CRYPTO' as const,
    }));
    const formattedFiatStakes = fiatStakes.map((stake) => ({
      ...stake,
      amount: Number(stake.amount),
      type: 'FIAT' as const,
      onChainTxHash: null,
    }));

    return [...formattedCryptoStakes, ...formattedFiatStakes].sort(
      (a, b) => new Date(b.stakedAt).getTime() - new Date(a.stakedAt).getTime(),
    );
  }

  async getAllPools() {
    const cryptoPools = await this.cryptoStakingService.getAllPools();
    const fiatPools = await this.fiatStakingService.getAvailablePools();

    const formattedCryptoPools = cryptoPools.map((pool) => ({
      ...pool,
      type: 'CRYPTO',
    }));
    const formattedFiatPools = fiatPools.map((pool) => ({
      tokenSymbol: pool.currency,
      baseApy: (pool.baseApyBps / 100).toFixed(2) + '%',
      maxApy: ((pool.baseApyBps + pool.bonusApyBps) / 100).toFixed(2) + '%',
      minStakeAmount: Number(pool.minStakeAmount),
      maxStakeAmount: Number(pool.maxStakeAmount),
      totalStaked: Number(pool.totalStaked),
      totalStakers: pool.totalStakers,
      type: 'FIAT',
    }));

    return [...formattedCryptoPools, ...formattedFiatPools];
  }

  //
  // GET POOL BY SYMBOL/CURRENCY
  //

  async getPoolBySymbol(tokenSymbol: string) {
    // Try to fetch as crypto pool first
    try {
      return await this.cryptoStakingService.getPoolBySymbol(tokenSymbol);
    } catch {
      // If not found, try as fiat pool
      try {
        return await this.fiatStakingService.getPoolByCurrency(tokenSymbol);
      } catch {
        throw new Error(
          `Pool ${tokenSymbol} not found in either crypto or fiat staking`,
        );
      }
    }
  }

  //
  // GET POOL STATISTICS
  //

  async getPoolStatistics(symbol: string) {
    // Try to fetch as crypto pool first
    try {
      return await this.cryptoStakingService.getPoolStatistics(symbol);
    } catch {
      // If not found, try as fiat pool
      try {
        return await this.fiatStakingService.getPoolStatistics(symbol);
      } catch {
        throw new Error(
          `Pool statistics for ${symbol} not found in either crypto or fiat staking`,
        );
      }
    }
  }

  //
  // CALCULATE REWARDS FOR STAKE POSITION
  //

  async calculateRewardsByStakePosition(
    userId: string,
    stakeId: string,
    type?: 'CRYPTO' | 'FIAT',
  ) {
    if (type === 'CRYPTO') {
      return this.cryptoStakingService.calculateRewardsByStakePosition(
        userId,
        stakeId,
      );
    } else if (type === 'FIAT') {
      return this.fiatStakingService.calculateRewardsByStakePosition(
        userId,
        stakeId,
      );
    }

    // If type not specified, try both
    try {
      return await this.cryptoStakingService.calculateRewardsByStakePosition(
        userId,
        stakeId,
      );
    } catch {
      try {
        return await this.fiatStakingService.calculateRewardsByStakePosition(
          userId,
          stakeId,
        );
      } catch {
        throw new Error('Stake not found in either crypto or fiat staking');
      }
    }
  }
}
