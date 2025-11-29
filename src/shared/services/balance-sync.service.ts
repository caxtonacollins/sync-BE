import {
  Inject,
  forwardRef,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { TokenContractService } from '../../contract/services/erc20-token/erc20-token.service';

export interface BalanceUpdate {
  currency: string;
  network?: string; // For crypto balances
  availableAmount: Decimal;
  stakedAmount?: Decimal;
  pendingAmount?: Decimal;
}

export interface CryptoBalanceUpdate extends BalanceUpdate {
  network: string;
}

export interface FiatBalanceUpdate extends BalanceUpdate {
  currency: string; // e.g., 'NGN', 'USD'
}

/**
 * BalanceSyncService
 *
 * Manages synchronization of user balances between database and blockchain.
 * This service implements a "database-first" pattern where:
 * 1. Balance updates are written to DB first (within a transaction)
 * 2. Then the change is sent to blockchain
 * 3. All read operations fetch from DB (fast cache)
 * 4. Background jobs verify DB state matches blockchain periodically
 *
 * This significantly improves performance by avoiding slow RPC calls for reads.
 */
@Injectable()
export class BalanceSyncService {
  private readonly logger = new Logger(BalanceSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TokenContractService))
    private readonly contractService: TokenContractService,
  ) { }

  /**
   * Update or create a fiat balance in the database
   * Used before sending balance changes to blockchain
   */
  async updateFiatBalance(
    userId: string,
    currency: string,
    update: Partial<FiatBalanceUpdate>,
  ) {
    try {
      const balance = await this.prisma.fiatBalance.upsert({
        where: {
          userId_currency: { userId, currency },
        },
        create: {
          userId,
          currency,
          available: update.availableAmount || new Decimal(0),
          staked: update.stakedAmount || new Decimal(0),
          pending: update.pendingAmount || new Decimal(0),
        },
        update: {
          ...(update.availableAmount !== undefined && {
            available: update.availableAmount,
          }),
          ...(update.stakedAmount !== undefined && {
            staked: update.stakedAmount,
          }),
          ...(update.pendingAmount !== undefined && {
            pending: update.pendingAmount,
          }),
          updatedAt: new Date(),
        },
      });

      this.logger.debug(
        `Fiat balance updated for user ${userId}, currency ${currency}`,
      );
      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to update fiat balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update or create a crypto balance in the database
   * Used before sending balance changes to blockchain
   */
  async updateCryptoBalance(
    userId: string,
    currency: string,
    network: string,
    update: Partial<CryptoBalanceUpdate>,
  ) {
    try {
      const balance = await this.prisma.cryptoBalance.upsert({
        where: {
          userId_currency_network: { userId, currency, network },
        },
        create: {
          userId,
          currency,
          network,
          available: update.availableAmount || new Decimal(0),
          staked: update.stakedAmount || new Decimal(0),
          pending: update.pendingAmount || new Decimal(0),
        },
        update: {
          ...(update.availableAmount !== undefined && {
            available: update.availableAmount,
          }),
          ...(update.stakedAmount !== undefined && {
            staked: update.stakedAmount,
          }),
          ...(update.pendingAmount !== undefined && {
            pending: update.pendingAmount,
          }),
          updatedAt: new Date(),
        },
      });

      this.logger.debug(
        `Crypto balance updated for user ${userId}, currency ${currency} on ${network}`,
      );
      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to update crypto balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Increment fiat balance (for deposits, transfers in, etc.)
   */
  async incrementFiatBalance(
    userId: string,
    currency: string,
    amount: Decimal,
    type: 'available' | 'staked' | 'pending' = 'available',
  ) {
    try {
      const balance = await this.prisma.fiatBalance.upsert({
        where: {
          userId_currency: { userId, currency },
        },
        create: {
          userId,
          currency,
          available: type === 'available' ? amount : new Decimal(0),
          staked: type === 'staked' ? amount : new Decimal(0),
          pending: type === 'pending' ? amount : new Decimal(0),
        },
        update: {
          [type]: { increment: amount },
          updatedAt: new Date(),
        },
      });

      this.logger.debug(
        `Fiat balance incremented by ${amount.toString()} for user ${userId}, currency ${currency}`,
      );
      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to increment fiat balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Decrement fiat balance (for withdrawals, transfers out, staking, etc.)
   */
  async decrementFiatBalance(
    userId: string,
    currency: string,
    amount: Decimal,
    type: 'available' | 'staked' | 'pending' = 'available',
  ) {
    try {
      // First, check if balance is sufficient
      const currentBalance = await this.prisma.fiatBalance.findUnique({
        where: {
          userId_currency: { userId, currency },
        },
      });

      if (!currentBalance || currentBalance[type].lessThan(amount)) {
        throw new BadRequestException(
          `Insufficient ${type} balance for ${currency}`,
        );
      }

      const balance = await this.prisma.fiatBalance.update({
        where: {
          userId_currency: { userId, currency },
        },
        data: {
          [type]: { decrement: amount },
          updatedAt: new Date(),
        },
      });

      this.logger.debug(
        `Fiat balance decremented by ${amount.toString()} for user ${userId}, currency ${currency}`,
      );
      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to decrement fiat balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Increment crypto balance
   */
  async incrementCryptoBalance(
    userId: string,
    currency: string,
    network: string,
    amount: Decimal,
    type: 'available' | 'staked' | 'pending' = 'available',
  ) {
    try {
      const balance = await this.prisma.cryptoBalance.upsert({
        where: {
          userId_currency_network: { userId, currency, network },
        },
        create: {
          userId,
          currency,
          network,
          available: type === 'available' ? amount : new Decimal(0),
          staked: type === 'staked' ? amount : new Decimal(0),
          pending: type === 'pending' ? amount : new Decimal(0),
        },
        update: {
          [type]: { increment: amount },
          updatedAt: new Date(),
        },
      });

      this.logger.debug(
        `Crypto balance incremented by ${amount.toString()} for user ${userId}, currency ${currency} on ${network}`,
      );
      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to increment crypto balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Decrement crypto balance
   */
  async decrementCryptoBalance(
    userId: string,
    currency: string,
    network: string,
    amount: Decimal,
    type: 'available' | 'staked' | 'pending' = 'available',
  ) {
    try {
      // First, check if balance is sufficient
      const currentBalance = await this.prisma.cryptoBalance.findUnique({
        where: {
          userId_currency_network: { userId, currency, network },
        },
      });

      if (!currentBalance || currentBalance[type].lessThan(amount)) {
        throw new BadRequestException(
          `Insufficient ${type} balance for ${currency} on ${network}`,
        );
      }

      const balance = await this.prisma.cryptoBalance.update({
        where: {
          userId_currency_network: { userId, currency, network },
        },
        data: {
          [type]: { decrement: amount },
          updatedAt: new Date(),
        },
      });

      this.logger.debug(
        `Crypto balance decremented by ${amount.toString()} for user ${userId}, currency ${currency} on ${network}`,
      );
      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to decrement crypto balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get current fiat balance for a user and currency
   * FAST - reads from database cache
   */
  async getFiatBalance(userId: string, currency: string) {
    try {
      const balance = await this.prisma.fiatBalance.findUnique({
        where: {
          userId_currency: { userId, currency },
        },
      });

      if (!balance) {
        // Return zero balance if not found
        return {
          userId,
          currency,
          available: new Decimal(0),
          staked: new Decimal(0),
          pending: new Decimal(0),
        };
      }

      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to get fiat balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get current crypto balance for a user
   * FAST - reads from database cache
   */
  async getCryptoBalance(userId: string, currency: string, network: string) {
    try {
      const balance = await this.prisma.cryptoBalance.findUnique({
        where: {
          userId_currency_network: { userId, currency, network },
        },
      });

      if (!balance) {
        // Return zero balance if not found
        return {
          userId,
          currency,
          network,
          available: new Decimal(0),
          staked: new Decimal(0),
          pending: new Decimal(0),
        };
      }

      return balance;
    } catch (error) {
      this.logger.error(
        `Failed to get crypto balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all fiat balances for a user
   * FAST - reads from database cache
   */
  async getAllFiatBalances(userId: string) {
    try {
      const balances = await this.prisma.fiatBalance.findMany({
        where: { userId },
      });
      return balances;
    } catch (error) {
      this.logger.error(
        `Failed to get all fiat balances for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get all crypto balances for a user
   * FAST - reads from database cache
   */
  async getAllCryptoBalances(userId: string) {
    try {
      const balances = await this.prisma.cryptoBalance.findMany({
        where: { userId },
      });
      return balances;
    } catch (error) {
      this.logger.error(
        `Failed to get all crypto balances for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Transfer balance between types (e.g., available -> staked)
   * Used when staking/unstaking
   */
  async transferFiatBalance(
    userId: string,
    currency: string,
    amount: Decimal,
    fromType: 'available' | 'staked' | 'pending',
    toType: 'available' | 'staked' | 'pending',
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Get current balance
        const balance = await tx.fiatBalance.findUnique({
          where: {
            userId_currency: { userId, currency },
          },
        });

        if (!balance || balance[fromType].lessThan(amount)) {
          throw new BadRequestException(
            `Insufficient ${fromType} balance for ${currency}`,
          );
        }

        // Update balance
        return await tx.fiatBalance.update({
          where: {
            userId_currency: { userId, currency },
          },
          data: {
            [fromType]: { decrement: amount },
            [toType]: { increment: amount },
            updatedAt: new Date(),
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to transfer fiat balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Transfer balance between types for crypto
   * Used when staking/unstaking
   */
  async transferCryptoBalance(
    userId: string,
    currency: string,
    network: string,
    amount: Decimal,
    fromType: 'available' | 'staked' | 'pending',
    toType: 'available' | 'staked' | 'pending',
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Get current balance
        const balance = await tx.cryptoBalance.findUnique({
          where: {
            userId_currency_network: { userId, currency, network },
          },
        });

        if (!balance || balance[fromType].lessThan(amount)) {
          throw new BadRequestException(
            `Insufficient ${fromType} balance for ${currency} on ${network}`,
          );
        }

        // Update balance
        return await tx.cryptoBalance.update({
          where: {
            userId_currency_network: { userId, currency, network },
          },
          data: {
            [fromType]: { decrement: amount },
            [toType]: { increment: amount },
            updatedAt: new Date(),
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Failed to transfer crypto balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Initialize or reset user balances
   * Useful for new accounts or manual corrections
   */
  async initializeBalances(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          cryptoWallets: {
            where: { isActive: true },
          }
        }
      });

      const cryptoWallets = user ? await this.prisma.cryptoWallet.findMany({
        where: { userId, isActive: true },
      }) : [];

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Create default fiat balances
      const fiatCurrencies = ['NGN', 'USD', 'GBP'];
      const fiats = await Promise.all(
        fiatCurrencies.map((currency) =>
          this.prisma.fiatBalance.upsert({
            where: {
              userId_currency: { userId, currency },
            },
            create: {
              userId,
              currency,
              available: new Decimal(0),
              staked: new Decimal(0),
              pending: new Decimal(0),
            },
            update: {},
          }),
        ),
      );

      // Define supported tokens and their networks
      const supportedTokens = [
        { currency: 'STRK', network: 'starknet' },
        { currency: 'ETH', network: 'starknet' },
        { currency: 'USDC', network: 'starknet' },
      ];

      // Process each crypto wallet
      const updatedBalances: Array<{
        id: string;
        userId: string;
        currency: string;
        available: Decimal;
        staked: Decimal;
        pending: Decimal;
        network: string;
        createdAt: Date;
        updatedAt: Date;
      }> = [];

      for (const wallet of cryptoWallets) {
        try {
          // Fetch balances for all supported tokens in parallel
          const tokenBalances = await this.contractService.getMultipleAccountBalances(
            supportedTokens.map(t => t.currency),
            wallet.address,
          );

          // Update each token balance in the database
          const walletBalances = await Promise.all(
            tokenBalances.map(async (tokenBalance) => {
              const amount = new Decimal(tokenBalance.formatted || 0);

              const updated = await this.prisma.cryptoBalance.upsert({
                where: {
                  userId_currency_network: {
                    userId,
                    currency: tokenBalance.symbol,
                    network: wallet.network,
                  },
                },
                create: {
                  userId,
                  currency: tokenBalance.symbol,
                  network: wallet.network,
                  available: amount,
                  staked: new Decimal(0),
                  pending: new Decimal(0),
                },
                update: {
                  available: amount,
                  updatedAt: new Date(),
                },
              });

              return updated;
            })
          );

          // Type assertion to handle the array spreading with proper typing
          updatedBalances.push(...(walletBalances.filter(Boolean) as typeof walletBalances[0][]));

        } catch (error) {
          this.logger.error(
            `Error updating balances for wallet ${wallet.id}:`,
            error.message,
          );
          // Continue with other wallets even if one fails
          continue;
        }
      }

      // If no active wallets, create default zero balances
      if (cryptoWallets.length === 0) {
        const defaultBalances = await Promise.all(
          supportedTokens.map(({ currency, network }) =>
            this.prisma.cryptoBalance.upsert({
              where: {
                userId_currency_network: { userId, currency, network },
              },
              create: {
                userId,
                currency,
                network,
                available: new Decimal(0),
                staked: new Decimal(0),
                pending: new Decimal(0),
              },
              update: {},
            }),
          ),
        );
        // Type assertion to handle the array spreading with proper typing
        updatedBalances.push(...(defaultBalances as typeof defaultBalances[0][]));
      }

      this.logger.debug(`Balances initialized for user ${userId}`);
      return {
        fiats,
        cryptos: updatedBalances.filter((b): b is Exclude<typeof b, null | undefined> => b != null)
      };
    } catch (error) {
      this.logger.error(
        `Failed to initialize balances for user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}
