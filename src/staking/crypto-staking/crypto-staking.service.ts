import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StakingContractService } from 'src/contract/services/staking/staking.service';
import { stringToFelt252 } from 'src/contract/utils';
import { BalanceSyncService } from 'src/shared/services/balance-sync.service';
import { CreateCryptoStakeDto, UnstakeCryptoDto, ClaimCryptoRewardsDto } from 'src/types/dto/crypto-staking/crypto-staking.dto';

@Injectable()
export class CryptoStakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contract: StakingContractService,
    private readonly balanceSync: BalanceSyncService,
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

    const pool = await this.prisma.cryptoStakingPool.findUnique({
      where: { tokenSymbol: dto.tokenSymbol },
    });

    if (!pool) {
      throw new NotFoundException('Staking pool not found');
    }

    const lockDurationSeconds = BigInt(dto.lockDays * 24 * 60 * 60);
    const unlockAt = new Date(Date.now() + Number(lockDurationSeconds) * 1000);

    const effectiveApyBps = this.calculateEffectiveApy(
      pool.baseApyBps,
      pool.bonusApyBps,
      dto.lockDays,
    );

    // Step 1: Complete all database operations first
    const result = await this.prisma.$transaction(async (tx) => {
      // 1a. Update user balance
      await tx.cryptoBalance.update({
        where: {
          userId_tokenSymbol_network: {
            userId: user.id,
            tokenSymbol: dto.tokenSymbol,
            network: pool.network,
          },
        },
        data: {
          available: { decrement: dto.amount },
          staked: { increment: dto.amount },
        },
      });

      // 1b. Create stake record with ACTIVE status (DB operation successful)
      const stake = await tx.cryptoStake.create({
        data: {
          userId: user.id,
          poolId: pool.id,
          tokenSymbol: dto.tokenSymbol,
          amount: dto.amount,
          lockDays: dto.lockDays,
          lockDurationSeconds,
          stakedAt: new Date(),
          unlockAt,
          status: 'ACTIVE', // DB operation successful, onchain pending
          baseApyBps: pool.baseApyBps,
          bonusApyBps: pool.bonusApyBps,
          effectiveApyBps,
          onChainRecorded: false,
        },
      });

      // 1c. Update pool statistics
      await tx.cryptoStakingPool.update({
        where: { id: pool.id },
        data: {
          totalStaked: { increment: dto.amount },
        },
      });

      return stake;
    });

    // Step 2: Call smart contract after DB operations are complete
    try {
      const call = {
        contractAddress: process.env.STAKING_CONTRACT_ADDRESS,
        entrypoint: 'stake',
        calldata: [
          stringToFelt252(dto.tokenSymbol),
          this.parseUnits(dto.amount, 18), // TODO:
          Number(lockDurationSeconds),
        ],
      };

      const { transactionHash, receipt } =
        await this.contract.executeUserStakingTransaction(userId, [call]);
      const onChainStakeId = this.getStakeIdFromEvents(
        (receipt.events as any[]) || [],
      );

      // Step 3: Update stake record with onchain data
      const updatedStake = await this.prisma.cryptoStake.update({
        where: { id: result.id },
        data: {
          onChainTxHash: transactionHash,
          onChainRecorded: true,
          onChainStakeId,
        },
      });

      return {
        success: true,
        stakeId: updatedStake.id,
        txHash: transactionHash,
        amount: dto.amount,
        tokenSymbol: dto.tokenSymbol,
        unlockAt: updatedStake.unlockAt,
        projectedRewards: this.calculateProjectedRewards(
          Number(dto.amount),
          effectiveApyBps,
          dto.lockDays,
        ),
        apy: (effectiveApyBps / 100).toFixed(2) + '%',
      };
    } catch (error) {
      console.error('Failed to stake on-chain:', error);

      // Revert all database changes since onchain failed
      await this.prisma.$transaction(async (tx) => {
        // Delete the stake record
        await tx.cryptoStake.delete({
          where: { id: result.id },
        });

        // Revert balance
        await tx.cryptoBalance.update({
          where: {
            userId_tokenSymbol_network: {
              userId: user.id,
              tokenSymbol: dto.tokenSymbol,
              network: pool.network,
            },
          },
          data: {
            available: { increment: dto.amount },
            staked: { decrement: dto.amount },
          },
        });

        // Revert pool stats
        await tx.cryptoStakingPool.update({
          where: { id: pool.id },
          data: {
            totalStaked: { decrement: dto.amount },
          },
        });
      });

      throw new BadRequestException(
        'Failed to stake on-chain: ' + error.message,
      );
    }
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
    const totalReturn = Number(stake.amount) + rewards;

    // Step 1: Update database first - mark as unstaking and update balances
    const result = await this.prisma.$transaction(async (tx) => {
      // 1a. Mark stake as UNSTAKED (DB operation successful)
      await tx.cryptoStake.update({
        where: { id: stake.id },
        data: {
          status: 'UNSTAKED',
          unstakedAt: new Date(),
          rewardsClaimed: rewards,
        },
      });

      // 1b. Return principal + rewards to user's available balance
      await tx.cryptoBalance.update({
        where: {
          userId_tokenSymbol_network: {
            userId,
            tokenSymbol: dto.tokenSymbol,
            network: stake.pool.network,
          },
        },
        data: {
          available: { increment: totalReturn },
          staked: { decrement: Number(stake.amount) },
        },
      });

      // 1c. Update pool statistics
      await tx.cryptoStakingPool.update({
        where: { id: stake.poolId },
        data: {
          totalStaked: { decrement: Number(stake.amount) },
        },
      });

      return { stakeId: stake.id };
    });

    // Step 2: Call smart contract after DB operations are complete
    try {
      const { transactionHash } = await this.contract.unstake(
        userId,
        dto.tokenSymbol,
        stake.onChainStakeId || 0,
      );

      // Step 3: Update stake with transaction hash
      await this.prisma.cryptoStake.update({
        where: { id: result.stakeId },
        data: {
          onChainTxHash: transactionHash,
        },
      });

      return {
        success: true,
        principal: Number(stake.amount),
        rewards,
        totalReturn,
        txHash: transactionHash,
      };
    } catch (error) {
      console.error('Failed to unstake on-chain:', error);

      // Revert database changes since onchain failed
      await this.prisma.$transaction(async (tx) => {
        // Restore stake to ACTIVE status
        await tx.cryptoStake.update({
          where: { id: result.stakeId },
          data: {
            status: 'ACTIVE',
            unstakedAt: null,
            rewardsClaimed: { decrement: rewards },
          },
        });

        // Revert balance
        await tx.cryptoBalance.update({
          where: {
            userId_tokenSymbol_network: {
              userId,
              tokenSymbol: dto.tokenSymbol,
              network: stake.pool.network,
            },
          },
          data: {
            available: { decrement: totalReturn },
            staked: { increment: Number(stake.amount) },
          },
        });

        // Revert pool stats
        await tx.cryptoStakingPool.update({
          where: { id: stake.poolId },
          data: {
            totalStaked: { increment: Number(stake.amount) },
          },
        });
      });

      throw new BadRequestException(
        'Failed to unstake on-chain: ' + error.message,
      );
    }
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

    // Step 1: Update database first - record reward claim and update balance
    const result = await this.prisma.$transaction(async (tx) => {
      // 1a. Update stake with last claim time and rewards claimed
      await tx.cryptoStake.update({
        where: { id: stake.id },
        data: {
          lastRewardClaim: new Date(),
          rewardsClaimed: { increment: rewards },
        },
      });

      // 1b. Add rewards to user's available balance
      await tx.cryptoBalance.update({
        where: {
          userId_tokenSymbol_network: {
            userId,
            tokenSymbol: dto.tokenSymbol,
            network: stake.pool.network,
          },
        },
        data: {
          available: { increment: rewards },
        },
      });

      return { stakeId: stake.id };
    });

    // Step 2: Call smart contract after DB operations are complete
    try {
      const { transactionHash } = await this.contract.claimRewards(
        userId,
        dto.tokenSymbol,
        stake.onChainStakeId || 0,
      );

      // Step 3: Update stake with transaction hash
      await this.prisma.cryptoStake.update({
        where: { id: result.stakeId },
        data: {
          onChainTxHash: transactionHash,
        },
      });

      return {
        success: true,
        rewardsClaimed: rewards,
        txHash: transactionHash,
      };
    } catch (error) {
      console.error('Failed to claim rewards on-chain:', error);

      // Revert database changes since onchain failed
      await this.prisma.$transaction(async (tx) => {
        // Revert stake reward claim
        await tx.cryptoStake.update({
          where: { id: result.stakeId },
          data: {
            rewardsClaimed: { decrement: rewards },
          },
        });

        // Revert balance
        await tx.cryptoBalance.update({
          where: {
            userId_tokenSymbol_network: {
              userId,
              tokenSymbol: dto.tokenSymbol,
              network: stake.pool.network,
            },
          },
          data: {
            available: { decrement: rewards },
          },
        });
      });

      throw new BadRequestException(
        'Failed to claim rewards on-chain: ' + error.message,
      );
    }
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

    // Step 1: Update database first - mark as emergency withdrawn and update balances
    const result = await this.prisma.$transaction(async (tx) => {
      // 1a. Mark stake as EMERGENCY_WITHDRAWN
      await tx.cryptoStake.update({
        where: { id: stake.id },
        data: {
          status: 'EMERGENCY_WITHDRAWN',
          unstakedAt: new Date(),
        },
      });

      // 1b. Return principal minus penalty to user's available balance
      await tx.cryptoBalance.update({
        where: {
          userId_tokenSymbol_network: {
            userId,
            tokenSymbol: dto.tokenSymbol,
            network: stake.pool.network,
          },
        },
        data: {
          available: { increment: amountAfterPenalty },
          staked: { decrement: Number(stake.amount) },
        },
      });

      // 1c. Update pool statistics
      await tx.cryptoStakingPool.update({
        where: { id: stake.poolId },
        data: {
          totalStaked: { decrement: Number(stake.amount) },
        },
      });

      return { stakeId: stake.id };
    });

    // Step 2: Call smart contract after DB operations are complete
    try {
      const { transactionHash } = await this.contract.emergencyUnstake(
        userId,
        dto.tokenSymbol,
        stake.onChainStakeId || 0,
      );

      // Step 3: Update stake with transaction hash
      await this.prisma.cryptoStake.update({
        where: { id: result.stakeId },
        data: {
          onChainTxHash: transactionHash,
        },
      });

      return {
        success: true,
        principalReturned: amountAfterPenalty,
        penalty,
        txHash: transactionHash,
      };
    } catch (error) {
      console.error('Failed to emergency unstake on-chain:', error);

      // Revert database changes since onchain failed
      await this.prisma.$transaction(async (tx) => {
        // Restore stake to ACTIVE status
        await tx.cryptoStake.update({
          where: { id: result.stakeId },
          data: {
            status: 'ACTIVE',
            unstakedAt: null,
          },
        });

        // Revert balance
        await tx.cryptoBalance.update({
          where: {
            userId_tokenSymbol_network: {
              userId,
              tokenSymbol: dto.tokenSymbol,
              network: stake.pool.network,
            },
          },
          data: {
            available: { decrement: amountAfterPenalty },
            staked: { increment: Number(stake.amount) },
          },
        });

        // Revert pool stats
        await tx.cryptoStakingPool.update({
          where: { id: stake.poolId },
          data: {
            totalStaked: { increment: Number(stake.amount) },
          },
        });
      });

      throw new BadRequestException(
        'Failed to emergency unstake on-chain: ' + error.message,
      );
    }
  }

  //
  // GET USER STAKES BY TOKEN SYMBOL
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
  // GET ALL STAKING
  //

  async getAllUserStakes(userId: string) {
    const stakes = await this.prisma.cryptoStake.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
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

  private calculateProjectedRewards(
    amount: number,
    apyBps: number,
    lockDays: number,
  ): number {
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
      return parseInt(stakedEvent.data[1] as string, 16);
    }
    return null;
  }

  private parseUnits(amount: string, decimals: number): bigint {
    const parts = amount.split('.');
    const wholePart = parts[0] || '0';
    const fracPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);
    return BigInt(wholePart + fracPart);
  }

  //
  // GET POOL BY SYMBOL
  //

  async getPoolBySymbol(tokenSymbol: string) {
    const pool = await this.prisma.cryptoStakingPool.findUnique({
      where: { tokenSymbol },
    });

    if (!pool) {
      throw new NotFoundException(`Pool for ${tokenSymbol} not found`);
    }

    return {
      tokenSymbol: pool.tokenSymbol,
      tokenAddress: pool.tokenAddress,
      network: pool.network,
      baseApy: (pool.baseApyBps / 100).toFixed(2) + '%',
      maxApy: ((pool.baseApyBps + pool.bonusApyBps) / 100).toFixed(2) + '%',
      minStakeAmount: Number(pool.minStakeAmount),
      maxStakeAmount: Number(pool.maxStakeAmount),
      totalStaked: Number(pool.totalStaked),
      totalStakers: pool.totalStakers,
      isActive: pool.isActive,
      createdAt: pool.createdAt,
      updatedAt: pool.updatedAt,
    };
  }

  //
  // GET POOL STATISTICS
  //

  async getPoolStatistics(tokenSymbol: string) {
    const pool = await this.prisma.cryptoStakingPool.findUnique({
      where: { tokenSymbol },
    });

    if (!pool) {
      throw new NotFoundException(`Pool for ${tokenSymbol} not found`);
    }

    const stakes = await this.prisma.cryptoStake.findMany({
      where: {
        tokenSymbol,
        status: 'ACTIVE',
      },
    });

    const totalRewards = stakes.reduce(
      (sum, stake) => sum + this.calculateRewards(stake),
      0,
    );

    return {
      tokenSymbol: pool.tokenSymbol,
      totalStaked: Number(pool.totalStaked),
      totalStakers: pool.totalStakers,
      totalRewardsDistributed: totalRewards,
      averageLockDuration:
        stakes.length > 0
          ? Math.round(
              stakes.reduce((sum, s) => sum + s.lockDays, 0) / stakes.length,
            )
          : 0,
      baseApy: (pool.baseApyBps / 100).toFixed(2) + '%',
      maxApy: ((pool.baseApyBps + pool.bonusApyBps) / 100).toFixed(2) + '%',
      poolStatus: pool.isActive ? 'active' : 'inactive',
    };
  }

  //
  // CALCULATE REWARDS FOR SPECIFIC STAKE POSITION
  //

  async calculateRewardsByStakePosition(userId: string, stakeId: string) {
    const stake = await this.prisma.cryptoStake.findFirst({
      where: {
        id: stakeId,
        userId,
      },
      include: { pool: true },
    });

    if (!stake) {
      throw new NotFoundException('Stake not found');
    }

    const currentRewards = this.calculateRewards(stake);
    const projectedYearlyRewards =
      (Number(stake.amount) * stake.effectiveApyBps) / 10000;
    const projectedTotalRewards =
      (Number(stake.amount) * stake.effectiveApyBps * stake.lockDays) /
      (10000 * 365);

    return {
      stakeId: stake.id,
      tokenSymbol: stake.tokenSymbol,
      amount: Number(stake.amount),
      currentRewards,
      projectedYearlyRewards,
      projectedTotalRewards,
      effectiveApy: (stake.effectiveApyBps / 100).toFixed(2) + '%',
      stakedAt: stake.stakedAt,
      unlockAt: stake.unlockAt,
      lastRewardClaim: stake.lastRewardClaim,
      totalRewardsClaimed: stake.rewardsClaimed,
    };
  }
}
