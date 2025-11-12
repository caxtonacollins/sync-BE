import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StakingContractService } from 'src/contract/services/staking/staking.service';
import { stringToFelt252 } from 'src/contract/utils';
import { Cron } from '@nestjs/schedule';
import {
  ClaimCryptoRewardsDto,
  CreateCryptoStakeDto,
  UnstakeCryptoDto,
} from './dto';

@Injectable()
export class CryptoStakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contract: StakingContractService,
  ) {}

  async stakeCrypto(userId: string, dto: CreateCryptoStakeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        cryptoBalances: true,
        cryptoWallets: true,
      },
    });

    if (!user || !user.starknetAccountAddress) {
      throw new BadRequestException('User must have a Starknet account');
    }

    // 1. Get staking pool
    const pool = await this.prisma.cryptoStakingPool.findUnique({
      where: { tokenSymbol: dto.tokenSymbol },
    });

    if (!pool || !pool.isActive) {
      throw new BadRequestException('Staking pool not available');
    }

    // 2. Check user balance
    const balance = user.cryptoBalances.find(
      (b) => b.currency === dto.tokenSymbol && b.network === pool.network,
    );

    const amountDecimal = parseFloat(dto.amount);

    if (!balance || Number(balance.available) < amountDecimal) {
      throw new BadRequestException('Insufficient balance');
    }

    // 3. Validate amount
    if (
      amountDecimal < Number(pool.minStakeAmount) ||
      amountDecimal > Number(pool.maxStakeAmount)
    ) {
      throw new BadRequestException('Amount outside allowed range');
    }

    // 4. Execute staking
    return await this.prisma.$transaction(async (tx) => {
      // 4a. Deduct from available balance
      await tx.cryptoBalance.update({
        where: {
          userId_currency_network: {
            userId: user.id,
            currency: dto.tokenSymbol,
            network: pool.network,
          },
        },
        data: {
          available: { decrement: amountDecimal },
          staked: { increment: amountDecimal },
        },
      });

      // 4b. Create stake record
      const lockDurationSeconds = BigInt(dto.lockDays * 24 * 60 * 60);
      const unlockAt = new Date(
        Date.now() + Number(lockDurationSeconds) * 1000,
      );

      const effectiveApyBps = this.calculateEffectiveApy(
        pool.baseApyBps,
        pool.bonusApyBps,
        dto.lockDays,
      );

      const stake = await tx.cryptoStake.create({
        data: {
          userId: user.id,
          poolId: pool.id,
          tokenSymbol: dto.tokenSymbol,
          amount: amountDecimal,
          lockDays: dto.lockDays,
          lockDurationSeconds,
          stakedAt: new Date(),
          unlockAt,
          status: 'ACTIVE',
          baseApyBps: pool.baseApyBps,
          bonusApyBps: pool.bonusApyBps,
          effectiveApyBps,
        },
      });

      // 4c. Call smart contract to stake
      try {
        const call = {
          contractAddress: process.env.STAKING_CONTRACT_ADDRESS,
          entrypoint: 'stake',
          calldata: [
            stringToFelt252(dto.tokenSymbol),
            this.parseUnits(dto.amount, 18),
            Number(lockDurationSeconds),
          ],
        };

        const { transactionHash, receipt } =
          await this.contract.executeUserStakingTransaction(userId, [call]);
        const onChainStakeId = this.getStakeIdFromEvents(receipt.events);

        // 4d. Update stake with transaction hash
        const updatedStake = await tx.cryptoStake.update({
          where: { id: stake.id },
          data: {
            onChainTxHash: transactionHash,
            onChainRecorded: true,
            onChainStakeId,
          },
        });

        // 4e. Update pool statistics
        await tx.cryptoStakingPool.update({
          where: { id: pool.id },
          data: {
            totalStaked: { increment: amountDecimal },
          },
        });

        return {
          success: true,
          stakeId: updatedStake.id,
          txHash: transactionHash,
          amount: dto.amount,
          tokenSymbol: dto.tokenSymbol,
          unlockAt: updatedStake.unlockAt,
          projectedRewards: await this.calculateProjectedRewards(
            amountDecimal,
            effectiveApyBps,
            dto.lockDays,
          ),
          apy: (effectiveApyBps / 100).toFixed(2) + '%',
        };
      } catch (error) {
        console.error('Failed to stake on-chain:', error);
        throw new BadRequestException(
          'Failed to stake on-chain: ' + error.message,
        );
      }
    });
  }

  //
  // UNSTAKE CRYPTO
  //

  async unstakeCrypto(userId: string, dto: UnstakeCryptoDto) {
    const stake = await this.prisma.cryptoStake.findFirst({
      where: {
        id: dto.stakeId,
        userId,
        tokenSymbol: dto.tokenSymbol,
        status: 'ACTIVE',
      },
      include: { pool: true, user: true },
    });

    if (!stake) {
      throw new NotFoundException('Stake not found or already unstaked');
    }

    if (new Date() < stake.unlockAt) {
      throw new BadRequestException(
        `Stake is locked until ${stake.unlockAt.toISOString()}`,
      );
    }

    const rewards = this.calculateRewards(stake);

    return await this.prisma.$transaction(async (tx) => {
      const call = {
        contractAddress: process.env.STAKING_CONTRACT_ADDRESS,
        entrypoint: 'unstake',
        calldata: [stringToFelt252(dto.tokenSymbol), stake.onChainStakeId || 0],
      };

      const { transactionHash } =
        await this.contract.executeUserStakingTransaction(userId, [call]);

      await tx.cryptoStake.update({
        where: { id: stake.id },
        data: {
          status: 'UNSTAKED',
          unstakedAt: new Date(),
          rewardsClaimed: rewards,
        },
      });

      const totalReturn = Number(stake.amount) + rewards;
      await tx.cryptoBalance.update({
        where: {
          userId_currency_network: {
            userId,
            currency: dto.tokenSymbol,
            network: stake.pool.network,
          },
        },
        data: {
          available: { increment: totalReturn },
          staked: { decrement: Number(stake.amount) },
        },
      });

      await tx.cryptoStakingPool.update({
        where: { id: stake.poolId },
        data: {
          totalStaked: { decrement: Number(stake.amount) },
        },
      });

      return {
        success: true,
        principal: Number(stake.amount),
        rewards,
        totalReturn,
        txHash: transactionHash,
      };
    });
  }

  //
  // CLAIM REWARDS
  //

  async claimRewards(userId: string, dto: ClaimCryptoRewardsDto) {
    const stake = await this.prisma.cryptoStake.findFirst({
      where: {
        id: dto.stakeId,
        userId,
        tokenSymbol: dto.tokenSymbol,
        status: 'ACTIVE',
      },
      include: { pool: true, user: true },
    });

    if (!stake) {
      throw new NotFoundException('Stake not found');
    }

    const rewards = this.calculateRewards(stake);
    if (rewards === 0) {
      throw new BadRequestException('No rewards to claim');
    }

    return await this.prisma.$transaction(async (tx) => {
      const call = {
        contractAddress: process.env.STAKING_CONTRACT_ADDRESS,
        entrypoint: 'claim_rewards',
        calldata: [stringToFelt252(dto.tokenSymbol), stake.onChainStakeId || 0],
      };

      const { transactionHash } =
        await this.contract.executeUserStakingTransaction(userId, [call]);

      await tx.cryptoStake.update({
        where: { id: stake.id },
        data: {
          lastRewardClaim: new Date(),
          rewardsClaimed: { increment: rewards },
        },
      });

      await tx.cryptoBalance.update({
        where: {
          userId_currency_network: {
            userId,
            currency: dto.tokenSymbol,
            network: stake.pool.network,
          },
        },
        data: {
          available: { increment: rewards },
        },
      });

      return {
        success: true,
        rewardsClaimed: rewards,
        txHash: transactionHash,
      };
    });
  }

  //
  // EMERGENCY UNSTAKE
  //

  async emergencyUnstake(userId: string, dto: UnstakeCryptoDto) {
    const stake = await this.prisma.cryptoStake.findFirst({
      where: {
        id: dto.stakeId,
        userId,
        tokenSymbol: dto.tokenSymbol,
        status: 'ACTIVE',
      },
      include: { pool: true, user: true },
    });

    if (!stake) {
      throw new NotFoundException('Stake not found');
    }

    const EMERGENCY_FEE_BPS = parseInt(
      process.env.EMERGENCY_WITHDRAWAL_FEE_BPS || '500',
    );
    const penalty = (Number(stake.amount) * EMERGENCY_FEE_BPS) / 10000;
    const amountAfterPenalty = Number(stake.amount) - penalty;

    return await this.prisma.$transaction(async (tx) => {
      const call = {
        contractAddress: process.env.STAKING_CONTRACT_ADDRESS,
        entrypoint: 'emergency_unstake',
        calldata: [stringToFelt252(dto.tokenSymbol), stake.onChainStakeId || 0],
      };

      const { transactionHash } =
        await this.contract.executeUserStakingTransaction(userId, [call]);

      await tx.cryptoStake.update({
        where: { id: stake.id },
        data: {
          status: 'EMERGENCY_WITHDRAWN',
          unstakedAt: new Date(),
        },
      });

      await tx.cryptoBalance.update({
        where: {
          userId_currency_network: {
            userId,
            currency: dto.tokenSymbol,
            network: stake.pool.network,
          },
        },
        data: {
          available: { increment: amountAfterPenalty },
          staked: { decrement: Number(stake.amount) },
        },
      });

      await tx.cryptoStakingPool.update({
        where: { id: stake.poolId },
        data: {
          totalStaked: { decrement: Number(stake.amount) },
        },
      });

      return {
        success: true,
        principalReturned: amountAfterPenalty,
        penalty,
        txHash: transactionHash,
      };
    });
  }

  //
  // GET USER STAKES
  //

  async getUserStakes(userId: string, tokenSymbol?: string) {
    const where: any = {
      userId,
      status: 'ACTIVE',
    };

    if (tokenSymbol) {
      where.tokenSymbol = tokenSymbol;
    }

    const stakes = await this.prisma.cryptoStake.findMany({
      where,
      include: {
        pool: true,
      },
      orderBy: { stakedAt: 'desc' },
    });

    return stakes.map((stake) => ({
      id: stake.id,
      tokenSymbol: stake.tokenSymbol,
      amount: Number(stake.amount),
      stakedAt: stake.stakedAt,
      unlockAt: stake.unlockAt,
      lockDays: stake.lockDays,
      apyBps: stake.effectiveApyBps,
      apy: (stake.effectiveApyBps / 100).toFixed(2) + '%',
      pendingRewards: this.calculateRewards(stake),
      isLocked: new Date() < stake.unlockAt,
      daysRemaining: this.getDaysRemaining(stake.unlockAt),
      onChainVerified: stake.onChainRecorded,
      onChainTxHash: stake.onChainTxHash,
    }));
  }

  //
  // GET ALL STAKING POOLS
  //

  async getAllPools() {
    const pools = await this.prisma.cryptoStakingPool.findMany({
      where: { isActive: true },
      orderBy: { tokenSymbol: 'asc' },
    });

    return pools.map((pool) => ({
      tokenSymbol: pool.tokenSymbol,
      tokenAddress: pool.tokenAddress,
      network: pool.network,
      baseApy: (pool.baseApyBps / 100).toFixed(2) + '%',
      maxApy: ((pool.baseApyBps + pool.bonusApyBps) / 100).toFixed(2) + '%',
      minStakeAmount: Number(pool.minStakeAmount),
      maxStakeAmount: Number(pool.maxStakeAmount),
      totalStaked: Number(pool.totalStaked),
      totalStakers: pool.totalStakers,
    }));
  }

  //
  // HELPER FUNCTIONS
  //

  private calculateRewards(stake: any): number {
    const now = new Date();
    const lastClaim = stake.lastRewardClaim || stake.stakedAt;
    const timeElapsed = (now.getTime() - lastClaim.getTime()) / 1000; // seconds

    // Reward = (amount * APY * time_elapsed) / (10000 * seconds_per_year)
    const SECONDS_PER_YEAR = 31536000;
    const reward =
      (Number(stake.amount) * stake.effectiveApyBps * timeElapsed) /
      (10000 * SECONDS_PER_YEAR);

    return Math.floor(reward * 1e8) / 1e8; // Round to 8 decimal places
  }

  private calculateEffectiveApy(
    baseApyBps: number,
    bonusApyBps: number,
    lockDays: number,
  ): number {
    const MIN_LOCK_DAYS = 1;
    const MAX_LOCK_DAYS = 365;

    const durationRange = MAX_LOCK_DAYS - MIN_LOCK_DAYS;
    const userRange = lockDays - MIN_LOCK_DAYS;

    const bonusMultiplier = userRange / durationRange;
    const bonus = Math.floor(bonusApyBps * bonusMultiplier);

    return baseApyBps + bonus;
  }

  private async calculateProjectedRewards(
    amount: number,
    apyBps: number,
    lockDays: number,
  ): Promise<number> {
    const yearlyRewards = (amount * apyBps) / 10000;
    const periodRewards = (yearlyRewards * lockDays) / 365;
    return Math.floor(periodRewards * 1e8) / 1e8;
  }

  private getDaysRemaining(unlockAt: Date): number {
    const now = new Date();
    const diff = unlockAt.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  private getStakeIdFromEvents(events: any[]): number | null {
    const stakedEvent = events.find(
      (e) =>
        e.keys[0] ===
        '0x20e130de2535358752e742b78d94186a64288a74a150a00cf438914c7720937',
    );
    if (stakedEvent && stakedEvent.data.length >= 2) {
      return parseInt(stakedEvent.data[1], 16);
    }
    return null;
  }

  private parseUnits(amount: string, decimals: number): bigint {
    const parts = amount.split('.');
    const wholePart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
    return BigInt(wholePart + fracPart);
  }
}
