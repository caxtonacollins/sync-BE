import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { keccak256 } from 'ethers';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateFiatStakeDto, UnstakeFiatDto, ClaimFiatRewardsDto } from './dto';
import { Cron } from '@nestjs/schedule';
import { MerkleTree } from 'merkletreejs';
import { StakingContractService } from 'src/contract/services/staking/staking.service';
import { stringToFelt252 } from 'src/contract/utils';
import { WalletService } from 'src/wallet/wallet.service';
import { QueueWithdrawalDto } from 'src/wallet/dto/queue-withdrawal.dto';
import { BalanceSyncService } from 'src/shared/services/balance-sync.service';
import Decimal from 'decimal.js';

@Injectable()
export class FiatStakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly starknet: StakingContractService,
    private readonly wallet: WalletService,
    private readonly balanceSync: BalanceSyncService,
  ) {}

  // STAKE FIAT
  async stakeFiat(userId: string, dto: CreateFiatStakeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { fiatBalances: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 1. Check user has sufficient fiat balance
    const balance = user.fiatBalances.find((b) => b.currency === dto.currency);
    if (!balance || balance.available.lessThan(dto.amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    // 2. Get staking pool configuration
    const pool = await this.prisma.fiatStakingPool.findUnique({
      where: { currency: dto.currency },
    });

    if (!pool || !pool.isActive) {
      throw new BadRequestException('Staking pool not available');
    }

    // 3. Validate amount
    const amountDecimal = new Decimal(dto.amount);
    if (
      amountDecimal.lessThan(pool.minStakeAmount) ||
      amountDecimal.greaterThan(pool.maxStakeAmount)
    ) {
      throw new BadRequestException('Amount outside allowed range');
    }

    // 4. Start database transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 4a. Deduct from available balance
      await tx.fiatBalance.update({
        where: {
          userId_currency: {
            userId: user.id,
            currency: dto.currency,
          },
        },
        data: {
          available: { decrement: dto.amount },
          staked: { increment: dto.amount },
        },
      });

      // 4b. Create stake record in database
      const lockDurationSeconds = dto.lockDays * 24 * 60 * 60;
      const unlockAt = new Date(Date.now() + lockDurationSeconds * 1000);
      const now = new Date();

      const stake = await tx.fiatStake.create({
        data: {
          userId: user.id,
          poolId: pool.id, // Add poolId reference
          currency: dto.currency,
          amount: dto.amount,
          lockDays: dto.lockDays,
          lockDurationSeconds: BigInt(lockDurationSeconds), // Add lockDurationSeconds
          stakedAt: now,
          unlockAt,
          lastRewardClaim: now, // Add lastRewardClaim
          status: 'ACTIVE',
          baseApyBps: pool.baseApyBps,
          bonusApyBps: pool.bonusApyBps,
          effectiveApyBps: this.calculateEffectiveApy(
            pool.baseApyBps,
            pool.bonusApyBps,
            dto.lockDays,
          ),
          rewardsClaimed: 0, // Initialize rewards claimed
          onChainRecorded: false, // Will be updated when recorded on-chain
          merkleProofVerified: false, // Will be updated when verified
        },
      });

      // 4c. Record on-chain (for transparency and proof)
      const amountInSmallestUnit = this.toSmallestUnit(
        dto.amount,
        dto.currency,
      );

      try {
        const { transactionHash } = await this.starknet.recordFiatStake(
          user.id,
          stringToFelt252(dto.currency),
          amountInSmallestUnit,
          lockDurationSeconds,
          stake.id,
        );

        // 4d. Update stake with transaction hash
        await tx.fiatStake.update({
          where: { id: stake.id },
          data: {
            onChainTxHash: transactionHash,
            onChainRecorded: true,
          },
        });

        return { stake, txHash: transactionHash };
      } catch {
        // If on-chain recording fails, rollback the transaction
        throw new BadRequestException('Failed to record stake on-chain');
      }
    });

    // 5. Trigger merkle tree update (async)
    void this.updateMerkleTreeAsync(dto.currency);

    return {
      success: true,
      stakeId: result.stake.id,
      txHash: result.txHash,
      amount: dto.amount,
      currency: dto.currency,
      unlockAt: result.stake.unlockAt,
      projectedRewards: await this.calculateProjectedRewards(
        dto.amount,
        result.stake.effectiveApyBps,
        dto.lockDays,
      ),
    };
  }

  //
  // UNSTAKE FIAT
  //

  async unstakeFiat(userId: string, dto: UnstakeFiatDto) {
    const stake = await this.prisma.fiatStake.findFirst({
      where: {
        id: dto.stakeId,
        userId,
        currency: dto.currency,
        status: 'ACTIVE',
      },
      include: { user: true },
    });

    if (!stake) {
      throw new NotFoundException('Stake not found or already unstaked');
    }

    // Check if unlock period has passed
    if (new Date() < stake.unlockAt) {
      throw new BadRequestException(
        `Stake is locked until ${stake.unlockAt.toISOString()}`,
      );
    }

    // Calculate final rewards
    const rewards = this.calculateRewards(stake);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Update stake status
      await tx.fiatStake.update({
        where: { id: stake.id },
        data: {
          status: 'UNSTAKED',
          unstakedAt: new Date(),
          rewardsClaimed: rewards,
        },
      });

      // 2. Return principal + rewards to user's available balance
      const totalReturn = stake.amount.add(rewards);

      await tx.fiatBalance.update({
        where: {
          userId_currency: {
            userId,
            currency: dto.currency,
          },
        },
        data: {
          available: { increment: totalReturn },
          staked: { decrement: stake.amount },
        },
      });

      // 3. Record unstake on-chain
      const { transactionHash } = await this.starknet.recordFiatUnstake(
        userId,
        stringToFelt252(dto.currency),
        stake.id,
      );

      // 4. Create transaction records
      await tx.fiatTransaction.createMany({
        data: [
          {
            userId,
            currency: dto.currency,
            amount: stake.amount,
            type: 'UNSTAKE_PRINCIPAL',
            status: 'COMPLETED',
            description: `Unstaked principal from ${dto.currency} stake`,
            reference: stake.id,
          },
          {
            userId,
            currency: dto.currency,
            amount: rewards,
            type: 'STAKING_REWARD',
            status: 'COMPLETED',
            description: `Staking rewards for ${dto.currency} stake`,
            reference: stake.id,
          },
        ],
      });

      // 5. Trigger bank transfer if needed (for large amounts)
      if (totalReturn.greaterThan(100000)) {
        // Threshold in currency units
        const withdrawalDto: QueueWithdrawalDto = {
          currency: dto.currency,
          amount: totalReturn.toNumber(),
          reason: 'STAKING_UNSTAKE',
          reference: stake.id,
          withdrawalMethod: 'BANK_TRANSFER',
          destinationAddress: stake.user.starknetAccountAddress || undefined,
          metadata: {
            type: 'STAKING_UNSTAKE',
            stakeId: stake.id,
          },
        };
        await this.wallet.queueLargeWithdrawal(userId, withdrawalDto);
      }

      return {
        success: true,
        principal: stake.amount,
        rewards,
        totalReturn,
        txHash: transactionHash,
      };
    });
  }

  //
  // CLAIM REWARDS (without unstaking)
  //

  async claimRewards(userId: string, dto: ClaimFiatRewardsDto) {
    const stake = await this.prisma.fiatStake.findFirst({
      where: {
        id: dto.stakeId,
        userId,
        currency: dto.currency,
        status: 'ACTIVE',
      },
      include: { user: true },
    });

    if (!stake) {
      throw new NotFoundException('Stake not found');
    }

    const rewards = this.calculateRewards(stake);

    if (rewards === 0) {
      throw new BadRequestException('No rewards to claim');
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Update stake with last claim time
      await tx.fiatStake.update({
        where: { id: stake.id },
        data: {
          lastRewardClaim: new Date(),
          rewardsClaimed: { increment: rewards },
        },
      });

      // 2. Add rewards to user's available balance
      await tx.fiatBalance.update({
        where: {
          userId_currency: {
            userId,
            currency: dto.currency,
          },
        },
        data: {
          available: { increment: rewards },
        },
      });

      // 3. Record on-chain
      const { transactionHash } = await this.starknet.recordFiatRewardClaim(
        userId,
        stringToFelt252(dto.currency),
        stake.id,
        rewards.toString(),
      );

      // 4. Create transaction record
      await tx.fiatTransaction.create({
        data: {
          userId,
          currency: dto.currency,
          amount: rewards,
          type: 'STAKING_REWARD',
          status: 'COMPLETED',
          description: `Claimed staking rewards for ${dto.currency}`,
          reference: stake.id,
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
  // GET USER'S STAKES
  //

  async getUserStakes(userId: string, currency?: string) {
    const where: any = {
      userId,
      status: 'ACTIVE',
    };

    if (currency) {
      where.currency = currency;
    }

    const stakes = await this.prisma.fiatStake.findMany({
      where,
      orderBy: { stakedAt: 'desc' },
    });

    return stakes.map((stake) => ({
      id: stake.id,
      currency: stake.currency,
      amount: stake.amount,
      stakedAt: stake.stakedAt,
      unlockAt: stake.unlockAt,
      lockDays: stake.lockDays,
      apyBps: stake.effectiveApyBps,
      apy: (stake.effectiveApyBps / 100).toFixed(2) + '%',
      pendingRewards: this.calculateRewards(stake),
      isLocked: new Date() < stake.unlockAt,
      daysRemaining: this.getDaysRemaining(stake.unlockAt),
      onChainVerified: stake.onChainRecorded,
    }));
  }

  //
  // MERKLE TREE GENERATION (for transparency)
  //

  @Cron('0 */6 * * *') // Every 6 hours
  async updateMerkleTreeForAllCurrencies() {
    const currencies = ['NGN', 'USD', 'GBP', 'GHS'];

    for (const currency of currencies) {
      await this.updateMerkleTreeAsync(currency);
    }
  }

  private async updateMerkleTreeAsync(currency: string) {
    try {
      // Get all active stakes for this currency
      const stakes = await this.prisma.fiatStake.findMany({
        where: {
          currency,
          status: 'ACTIVE',
        },
        include: {
          user: true,
        },
      });

      // Build merkle tree
      const leaves = stakes.map((stake) =>
        keccak256(
          Buffer.from(
            `${stake.user.starknetAccountAddress}:${stake.currency}:${stake.amount.toString()}:${stake.id}`,
          ),
        ),
      );

      const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
      const root = tree.getHexRoot();

      // Store merkle root on-chain
      await this.starknet.updateBalanceMerkleRoot(stringToFelt252(root));

      // Store in database
      await this.prisma.merkleTreeBatch.create({
        data: {
          currency,
          merkleRoot: root,
          totalStakes: stakes.length,
          totalAmount: stakes
            .reduce((sum, s) => sum.plus(s.amount), new Decimal(0))
            .toNumber(),
          leaves: leaves,
        },
      });

      console.log(`Merkle tree updated for ${currency}: ${root}`);
    } catch (error) {
      console.error(`Failed to update merkle tree for ${currency}:`, error);
    }
  }

  //
  // PROOF OF RESERVES (Audit Trail)
  //

  @Cron('0 0 * * 0') // Every Sunday at midnight
  async createWeeklyReserveSnapshot() {
    const currencies = ['NGN', 'USD', 'GBP', 'GHS'];

    for (const currency of currencies) {
      try {
        // 1. Get total staked from database
        const totalStaked = await this.prisma.fiatStake.aggregate({
          where: {
            currency,
            status: 'ACTIVE',
          },
          _sum: {
            amount: true,
          },
        });

        const totalStakedAmount = totalStaked._sum.amount?.toNumber() || 0;

        if (totalStakedAmount <= 0) {
          console.log(`No active stakes found for ${currency}, skipping...`);
          continue;
        }

        // 2. Get actual bank balance from wallet API
        const bankBalance = await this.wallet.getBankBalance(currency);

        if (bankBalance === null || bankBalance === undefined) {
          throw new Error(`Failed to get bank balance for ${currency}`);
        }

        // 3. Calculate reserve ratio with proper decimal handling
        const reserveRatioBps = Math.floor(
          (Number(bankBalance) / totalStakedAmount) * 10000,
        );

        // 4. Generate audit report and upload to IPFS
        const auditReport = {
          currency,
          timestamp: new Date().toISOString(),
          totalStaked: totalStakedAmount,
          bankBalance: Number(bankBalance),
          reserveRatio: reserveRatioBps / 100 + '%',
          transactions: await this.getRecentTransactions(currency),
        };

        let ipfsHash: string;
        try {
          ipfsHash = await this.uploadToIPFS(auditReport);
        } catch (error) {
          console.error(
            `Failed to upload audit report to IPFS for ${currency}:`,
            error,
          );
          throw new Error('Failed to upload audit report to IPFS');
        }

        // 5. Record snapshot on-chain with auditor signature
        let auditorSignature: string | null = null;
        try {
          auditorSignature = await this.getAuditorSignature();

          if (auditorSignature) {
            await this.starknet.createReserveSnapshot(
              stringToFelt252(currency),
              this.toSmallestUnit(bankBalance, currency),
              auditorSignature,
              stringToFelt252(ipfsHash),
            );
          } else {
            console.warn(
              'Received null auditor signature, skipping on-chain snapshot',
            );
          }
        } catch (error) {
          console.error(
            `Failed to create on-chain snapshot for ${currency}:`,
            error,
          );
          // Continue with database snapshot even if on-chain fails
        }

        // 6. Store in database
        try {
          await this.prisma.reserveSnapshot.create({
            data: {
              currency,
              totalStaked: totalStakedAmount,
              bankBalance: Number(bankBalance),
              reserveRatioBps,
              ipfsHash,
              auditorSignature: auditorSignature || null,
            },
          });

          console.log(`Successfully created reserve snapshot for ${currency}`);
        } catch (error) {
          console.error(
            `Failed to save reserve snapshot to database for ${currency}:`,
            error,
          );
          throw error; // Rethrow to trigger error handling
        }

        // 7. Alert if reserves are insufficient
        if (reserveRatioBps < 10000) {
          const alertMessage = `⚠️ Reserve ratio for ${currency} is below 100%: ${reserveRatioBps / 100}%`;
          console.warn(alertMessage);
          this.sendAlertToAdmin(alertMessage);
        }
      } catch (error) {
        console.error(
          `Failed to create reserve snapshot for ${currency}:`,
          error,
        );
      }
    }
  }

  async getAvailablePools() {
    return this.prisma.fiatStakingPool.findMany();
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
      (stake.amount * stake.effectiveApyBps * timeElapsed) /
      (10000 * SECONDS_PER_YEAR);

    return Math.floor(reward * 100) / 100; // Round to 2 decimal places
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

  calculateProjectedRewards(
    amount: number,
    apyBps: number,
    lockDays: number,
  ): Promise<number> {
    const yearlyRewards = (amount * apyBps) / 10000;
    const periodRewards = (yearlyRewards * lockDays) / 365;
    return Promise.resolve(Math.floor(periodRewards * 100) / 100);
  }

  private getDaysRemaining(unlockAt: Date): number {
    const now = new Date();
    const diff = unlockAt.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  private toSmallestUnit(amount: number, currency: string): bigint {
    // Most fiat currencies use 2 decimal places (cents, kobo, etc.)
    const decimals = this.getCurrencyDecimals(currency);
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
  }

  private getCurrencyDecimals(currency: string): number {
    const decimalsMap: Record<string, number> = {
      NGN: 2, // Kobo
      USD: 2, // Cents
      GBP: 2, // Pence
      GHS: 2, // Pesewas
      ZAR: 2, // Cents
    };
    return decimalsMap[currency] || 2;
  }

  private async uploadToIPFS(data: any): Promise<string> {
    console.log('Uploading data to IPFS:', data);
    // Upload to IPFS and return hash
    // Implement using services like Pinata, Infura, etc.
    return Promise.resolve('Qm...');
  }

  private getAuditorSignature(): Promise<string> {
    // Get digital signature from external auditor
    return Promise.resolve('signature...');
  }

  private async getRecentTransactions(currency: string) {
    return await this.prisma.fiatTransaction.findMany({
      where: { currency },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
  }

  private sendAlertToAdmin(message: string): void {
    // Send alert via email, Slack, etc.
    console.error(message);
  }

  //
  // GET POOL BY CURRENCY
  //

  async getPoolByCurrency(currency: string) {
    const pool = await this.prisma.fiatStakingPool.findUnique({
      where: { currency },
    });

    if (!pool) {
      throw new NotFoundException(`Pool for ${currency} not found`);
    }

    return {
      currency: pool.currency,
      baseApy: (pool.baseApyBps / 100).toFixed(2) + '%',
      maxApy: ((pool.baseApyBps + pool.bonusApyBps) / 100).toFixed(2) + '%',
      minStakeAmount: pool.minStakeAmount.toNumber(),
      maxStakeAmount: pool.maxStakeAmount.toNumber(),
      totalStaked: pool.totalStaked.toNumber(),
      totalStakers: pool.totalStakers,
      isActive: pool.isActive,
      createdAt: pool.createdAt,
      updatedAt: pool.updatedAt,
    };
  }

  //
  // GET POOL STATISTICS
  //

  async getPoolStatistics(currency: string) {
    const pool = await this.prisma.fiatStakingPool.findUnique({
      where: { currency },
    });

    if (!pool) {
      throw new NotFoundException(`Pool for ${currency} not found`);
    }

    const stakes = await this.prisma.fiatStake.findMany({
      where: {
        currency,
        status: 'ACTIVE',
      },
    });

    const totalRewards = stakes.reduce(
      (sum, stake) => sum + this.calculateRewards(stake),
      0,
    );

    return {
      currency: pool.currency,
      totalStaked: pool.totalStaked.toNumber(),
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
    const stake = await this.prisma.fiatStake.findFirst({
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
      (stake.amount.toNumber() * stake.effectiveApyBps) / 10000;
    const projectedTotalRewards =
      (stake.amount.toNumber() * stake.effectiveApyBps * stake.lockDays) /
      (10000 * 365);

    return {
      stakeId: stake.id,
      currency: stake.currency,
      amount: stake.amount.toNumber(),
      currentRewards,
      projectedYearlyRewards,
      projectedTotalRewards,
      effectiveApy: (stake.effectiveApyBps / 100).toFixed(2) + '%',
      stakedAt: stake.stakedAt,
      unlockAt: stake.unlockAt,
      lastRewardClaim: stake.lastRewardClaim,
      totalRewardsClaimed: stake.rewardsClaimed.toNumber(),
    };
  }

  //
  // EMERGENCY UNSTAKE FIAT (if applicable)
  //

  async emergencyUnstakeFiat(userId: string, dto: UnstakeFiatDto) {
    const stake = await this.prisma.fiatStake.findFirst({
      where: {
        id: dto.stakeId,
        userId,
        currency: dto.currency,
        status: 'ACTIVE',
      },
      include: { user: true },
    });

    if (!stake) {
      throw new NotFoundException('Stake not found or already unstaked');
    }

    const EMERGENCY_FEE_BPS = parseInt(
      process.env.EMERGENCY_WITHDRAWAL_FEE_BPS || '1000',
    );
    const penalty = (stake.amount.toNumber() * EMERGENCY_FEE_BPS) / 10000;
    const amountAfterPenalty = new Decimal(stake.amount).minus(penalty);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Update stake status
      await tx.fiatStake.update({
        where: { id: stake.id },
        data: {
          status: 'EMERGENCY_WITHDRAWN',
          unstakedAt: new Date(),
        },
      });

      // 2. Return principal minus penalty to user's available balance
      await tx.fiatBalance.update({
        where: {
          userId_currency: {
            userId,
            currency: dto.currency,
          },
        },
        data: {
          available: { increment: amountAfterPenalty },
          staked: { decrement: stake.amount },
        },
      });

      // 3. Record emergency unstake on-chain
      const { transactionHash } = await this.starknet.recordFiatUnstake(
        userId,
        stringToFelt252(dto.currency),
        stake.id,
      );

      // 4. Create transaction records
      await tx.fiatTransaction.createMany({
        data: [
          {
            userId,
            currency: dto.currency,
            amount: amountAfterPenalty,
            type: 'UNSTAKE_PRINCIPAL',
            status: 'COMPLETED',
            description: `Emergency unstaked principal from ${dto.currency} stake with penalty`,
            reference: stake.id,
          },
          {
            userId,
            currency: dto.currency,
            amount: new Decimal(penalty),
            type: 'STAKING_REWARD',
            status: 'COMPLETED',
            description: `Emergency unstake penalty for ${dto.currency} stake`,
            reference: stake.id,
          },
        ],
      });

      return {
        success: true,
        principalReturned: amountAfterPenalty.toNumber(),
        penalty,
        txHash: transactionHash,
      };
    });
  }
}
