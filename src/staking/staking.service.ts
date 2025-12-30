import { Injectable } from '@nestjs/common';
import { CryptoStakingService } from 'src/staking/crypto-staking/crypto-staking.service';
import { ExchangeRateService } from 'src/transaction/exchange-rate-and-pragma/exchange-rate.service';
import { Stake } from 'src/types';

@Injectable()
export class StakingService {
  constructor(
    private readonly cryptoStakingService: CryptoStakingService,
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
      const tokenSymbol =
        stake.type === 'CRYPTO' ? stake.tokenSymbol : stake.tokenSymbol;
      const rates = await this.exchangeRateService.getExchangeRateFor([
        tokenSymbol,
      ]);
      const rate = rates[tokenSymbol] || 0;
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

    const formattedCryptoStakes = cryptoStakes.map((stake) => ({
      ...stake,
      type: 'CRYPTO' as const,
    }));

    return [...formattedCryptoStakes].sort(
      (a, b) => new Date(b.stakedAt).getTime() - new Date(a.stakedAt).getTime(),
    );
  }

  async getAllPools() {
    const cryptoPools = await this.cryptoStakingService.getAllPools();

    const formattedCryptoPools = cryptoPools.map((pool) => ({
      ...pool,
      type: 'CRYPTO',
    }));

    return [...formattedCryptoPools];
  }

  //
  // GET POOL BY SYMBOL/tokenSymbol
  //

  async getPoolBySymbol(tokenSymbol: string) {
    // Try to fetch as crypto pool first
    try {
      return await this.cryptoStakingService.getPoolBySymbol(tokenSymbol);
    } catch {
      throw new Error(
          `Pool ${tokenSymbol} not found in either crypto or fiat staking`,
        );
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
      throw new Error(
        `Pool statistics for ${symbol} not found in either crypto or fiat staking`,
      );
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
    try {
      return await this.cryptoStakingService.calculateRewardsByStakePosition(
        userId,
        stakeId,
      );
    } catch {
      throw new Error('Stake not found in either crypto or fiat staking');
    }
  }
}
