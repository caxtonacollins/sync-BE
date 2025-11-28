import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { StakingContractService } from 'src/contract/services/staking/staking.service';
import Decimal from 'decimal.js';

export interface CacheValidationResult {
  userId: string;
  currency: string;
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
            balance.currency,
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
              currency: balance.currency,
              network: balance.network,
              dbValue: dbStaked,
              blockchainValue: blockchainStaked,
              isValid: false,
              discrepancy: difference.toString(),
            });

            this.logger.warn(
              `Crypto balance discrepancy detected for user ${balance.userId} (${balance.currency}): DB=${dbStaked.toString()}, Blockchain=${blockchainStaked.toString()}, Diff=${difference.toString()}`,
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
  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncFiatBalances() {
    try {
      this.logger.debug('Starting fiat balance cache sync...');

      // Get all active fiat balances
      const fiatBalances = await this.prisma.fiatBalance.findMany({
        include: {
          user: {
            include: {
              fiatAccounts: {
                where: { isActive: true },
              },
            },
          },
        },
      });

      if (fiatBalances.length === 0) {
        this.logger.debug('No fiat balances to sync');
        return;
      }

      const discrepancies: CacheValidationResult[] = [];

      for (const balance of fiatBalances) {
        try {
          // Find corresponding fiat account
          const fiatAccount = balance.user.fiatAccounts.find(
            (acc) => acc.currency === balance.currency,
          );

          if (!fiatAccount) {
            continue;
          }

          // In a real implementation, you would call a bank reconciliation service
          // For now, we'll use the FiatAccount balance as reference
          const bankBalance = new Decimal(fiatAccount.balance.toString());
          const dbBalance = balance.available;

          // Check for discrepancies (with small tolerance)
          const tolerance = new Decimal('0.01'); // 1 cent tolerance for fiat
          const difference = bankBalance.minus(dbBalance).abs();

          if (difference.greaterThan(tolerance)) {
            discrepancies.push({
              userId: balance.userId,
              currency: balance.currency,
              dbValue: dbBalance,
              blockchainValue: bankBalance,
              isValid: false,
              discrepancy: difference.toString(),
            });

            this.logger.warn(
              `Fiat balance discrepancy detected for user ${balance.userId} (${balance.currency}): DB=${dbBalance.toString()}, Bank=${bankBalance.toString()}, Diff=${difference.toString()}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to validate fiat balance for user ${balance.userId}:`,
            error,
          );
        }
      }

      if (discrepancies.length > 0) {
        this.logger.warn(
          `Found ${discrepancies.length} fiat balance discrepancies`,
        );
      }

      this.logger.debug('Fiat balance cache sync completed');
    } catch (error) {
      this.logger.error('Error during fiat balance sync:', error);
    }
  }

  /**
   * Manual validation endpoint: Verify a specific user's balance
   */
  async validateUserBalance(
    userId: string,
    currency: string,
    network?: string,
  ): Promise<CacheValidationResult> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      if (network) {
        // Crypto balance validation
        const dbBalance = await this.prisma.cryptoBalance.findUnique({
          where: {
            userId_currency_network: { userId, currency, network },
          },
        });

        if (!dbBalance) {
          return {
            userId,
            currency,
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
          currency,
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
          currency,
          network,
          dbValue: dbStaked,
          blockchainValue: blockchainStaked,
          isValid: difference.lessThanOrEqualTo(tolerance),
          discrepancy: difference.toString(),
        };
      } else {
        // Fiat balance validation
        const dbBalance = await this.prisma.fiatBalance.findUnique({
          where: {
            userId_currency: { userId, currency },
          },
        });

        if (!dbBalance) {
          return {
            userId,
            currency,
            dbValue: new Decimal(0),
            blockchainValue: new Decimal(0),
            isValid: true,
          };
        }

        const fiatAccount = await this.prisma.fiatAccount.findFirst({
          where: { userId, currency },
        });

        const bankBalance = fiatAccount
          ? new Decimal(fiatAccount.balance.toString())
          : new Decimal(0);
        const dbAvailable = dbBalance.available;
        const difference = bankBalance.minus(dbAvailable).abs();
        const tolerance = new Decimal('0.01');

        return {
          userId,
          currency,
          dbValue: dbAvailable,
          blockchainValue: bankBalance,
          isValid: difference.lessThanOrEqualTo(tolerance),
          discrepancy: difference.toString(),
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to validate user balance ${userId}/${currency}:`,
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
            balance.currency,
            balance.network,
          );

          if (!result.isValid) {
            discrepancies.push(result);
          }
        } catch {
          this.logger.warn(
            `Failed to validate balance ${balance.userId}/${balance.currency}`,
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
   * Clear/reset cache for a user (admin function)
   * Forces re-sync from blockchain on next balance query
   */
  async clearUserCache(userId: string) {
    try {
      await this.prisma.$transaction([
        this.prisma.fiatBalance.deleteMany({
          where: { userId },
        }),
        this.prisma.cryptoBalance.deleteMany({
          where: { userId },
        }),
      ]);

      this.logger.debug(`Cache cleared for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to clear cache for user ${userId}:`, error);
      throw error;
    }
  }
}
