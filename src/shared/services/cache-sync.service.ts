import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { StakingContractService } from 'src/contract/services/staking/staking.service';
import Decimal from 'decimal.js';

export interface CacheValidationResult {
  userId: string;
  tokenSymbol: string;
  network?: string;
  dbValue: Decimal;
  blockchainValue: Decimal;
  isValid: boolean;
  discrepancy?: string;
}

/**
 * CacheSyncService
 *
 * Periodically verifies that database cached balances match blockchain data.
 * This ensures data consistency and detects any discrepancies that need reconciliation.
 *
 * Runs background jobs to:
 * 1. Validate cached balances against blockchain
 * 2. Log discrepancies for investigation
 * 3. Optionally auto-correct minor differences
 * 4. Alert on major inconsistencies
 */
@Injectable()
export class CacheSyncService {
  private readonly logger = new Logger(CacheSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => StakingContractService))
    private readonly stakingContract: StakingContractService,
  ) {}

  /**
   * Background job: Sync crypto balance cache with blockchain
   * Runs every 5 minutes to validate data consistency
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncCryptoBalances() {
    try {
      this.logger.debug('Starting crypto balance cache sync...');

      // Get all active users with crypto balances
      const cryptoBalances = await this.prisma.cryptoBalance.findMany({
        include: {
          user: true,
        },
      });

      if (cryptoBalances.length === 0) {
        this.logger.debug('No crypto balances to sync');
        return;
      }

      const discrepancies: CacheValidationResult[] = [];

      for (const balance of cryptoBalances) {
        try {
          // Only validate if user has a starknet account
          if (!balance.user.starknetAccountAddress) {
            continue;
          }

          // Get blockchain balance (for crypto stakes)
          const stakePositions = await this.stakingContract.getStakePositions(
            balance.user.starknetAccountAddress,
            balance.tokenSymbol,
          );

          // Calculate total staked from positions
          const blockchainStaked = stakePositions.reduce((sum, position) => {
            const amount = new Decimal(String(position.amount || 0));
            return sum.plus(amount);
          }, new Decimal(0));

          const dbStaked = balance.staked;

          // Check for discrepancies (with small tolerance for rounding)
          const tolerance = new Decimal('0.000001');
          const difference = blockchainStaked.minus(dbStaked).abs();

          if (difference.greaterThan(tolerance)) {
            discrepancies.push({
              userId: balance.userId,
              tokenSymbol: balance.tokenSymbol,
              network: balance.network,
              dbValue: dbStaked,
              blockchainValue: blockchainStaked,
              isValid: false,
              discrepancy: difference.toString(),
            });

            this.logger.warn(
              `Crypto balance discrepancy detected for user ${balance.userId} (${balance.tokenSymbol}): DB=${dbStaked.toString()}, Blockchain=${blockchainStaked.toString()}, Diff=${difference.toString()}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to validate crypto balance for user ${balance.userId}:`,
            error,
          );
        }
      }

      if (discrepancies.length > 0) {
        this.logger.warn(
          `Found ${discrepancies.length} crypto balance discrepancies`,
        );
        // Could send alert here
      }

      this.logger.debug('Crypto balance cache sync completed');
    } catch (error) {
      this.logger.error('Error during crypto balance sync:', error);
    }
  }

  /**
   * Background job: Sync fiat balance cache with bank records
   * Note: This would typically verify against a bank reconciliation service
   * Runs every 30 minutes
   */
  /**
   * Manual validation endpoint: Verify a specific user's crypto balance
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async validateUserBalance(
    userId: string,
    tokenSymbol: string,
    network: string,
  ): Promise<CacheValidationResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (!network) {
        throw new Error('Network is required for crypto balance validation');
      }

      // Crypto balance validation
      const dbBalance = await this.prisma.cryptoBalance.findUnique({
        where: {
          userId_tokenSymbol_network: { userId, tokenSymbol, network },
        },
      });

      if (!dbBalance) {
        return {
          userId,
          tokenSymbol,
          network,
          dbValue: new Decimal(0),
          blockchainValue: new Decimal(0),
          isValid: true,
        };
      }

      // Get blockchain balance
      if (!user.starknetAccountAddress) {
        throw new Error('User has no starknet account');
      }

      const stakePositions = await this.stakingContract.getStakePositions(
        user.starknetAccountAddress,
        tokenSymbol,
      );

      const blockchainStaked = stakePositions.reduce((sum, position) => {
        const amount = new Decimal(String(position.amount || 0));
        return sum.plus(amount);
      }, new Decimal(0));

      const dbStaked = dbBalance.staked;
      const difference = blockchainStaked.minus(dbStaked).abs();
      const tolerance = new Decimal('0.000001');

      return {
        userId,
        tokenSymbol,
        network,
        dbValue: dbStaked,
        blockchainValue: blockchainStaked,
        isValid: difference.lessThanOrEqualTo(tolerance),
        discrepancy: difference.toString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to validate user balance ${userId}/${tokenSymbol}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all balance discrepancies for investigation
   */
  async getDiscrepancies(): Promise<CacheValidationResult[]> {
    try {
      const discrepancies: CacheValidationResult[] = [];

      // Check crypto balances
      const cryptoBalances = await this.prisma.cryptoBalance.findMany({
        include: {
          user: true,
        },
      });

      for (const balance of cryptoBalances) {
        if (!balance.user.starknetAccountAddress) {
          continue;
        }

        try {
          const result = await this.validateUserBalance(
            balance.userId,
            balance.tokenSymbol,
            balance.network,
          );

          if (!result.isValid) {
            discrepancies.push(result);
          }
        } catch {
          this.logger.warn(
            `Failed to validate balance ${balance.userId}/${balance.tokenSymbol}`,
          );
        }
      }

      return discrepancies;
    } catch (error) {
      this.logger.error('Failed to get discrepancies:', error);
      throw error;
    }
  }

  /**
   * Clear/reset crypto cache for a user (admin function)
   * Forces re-sync from blockchain on next balance query
   */
  async clearUserCache(userId: string) {
    try {
      await this.prisma.cryptoBalance.deleteMany({
        where: { userId },
      });

      this.logger.debug(`Crypto cache cleared for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to clear crypto cache for user ${userId}:`, error);
      throw error;
    }
  }
}
