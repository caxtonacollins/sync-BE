import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MonnifyService } from '../monnify/monnify.service';
import { Logger } from '@nestjs/common';
import { FiatAccount, CryptoWallet } from '@prisma/client';
import { ContractService } from 'src/contract/contract.service';

export interface UnifiedWalletBalance {
  userId: string;
  fiatBalances: {
    currency: string;
    balance: number;
    accountId: string;
    provider: string;
    isDefault: boolean;
  }[];
  cryptoBalances: {
    currency: string;
    balance: number;
    walletId: string;
    network: string;
    address: string;
    isDefault: boolean;
  }[];
  totalValueUSD: number;
  totalValueNGN: number;
}

export interface WalletTransaction {
  id: string;
  type: 'fiat' | 'crypto';
  currency: string;
  amount: number;
  status: string;
  reference: string;
  createdAt: Date;
  metadata?: any;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monnifyService: MonnifyService,
    @Inject(forwardRef(() => ContractService))
    private readonly contractService: ContractService,
  ) {}

  /**
   * Get fiat accounts for a user
   */
  async getFiatAccounts(userId: string) {
    try {
      const accounts = await this.prisma.fiatAccount.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return accounts.map((account) => ({
        id: account.id,
        name: `${account.user.firstName} ${account.user.lastName}`,
        accountNumber: account.accountNumber,
        balance: 0,
        currency: account.currency,
        initials: `${account.user.firstName[0]}${account.user.lastName[0]}`,
        isDefault: account.isDefault,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get fiat accounts for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async getFiatAccountForUser(userId: string): Promise<FiatAccount | null> {
    return this.prisma.fiatAccount.findFirst({
      where: {
        userId,
        isActive: true,
        isDefault: true,
      },
    });
  }

  async getCryptoWallets(userId: string) {
    try {
      const wallets = await this.prisma.cryptoWallet.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return wallets.map((wallet) => ({
        id: wallet.id,
        name: `${wallet.user.firstName} ${wallet.user.lastName}`,
        address: wallet.address,
        balance: 0,
        currency: wallet.currency,
        initials: `${wallet.user.firstName[0]}${wallet.user.lastName[0]}`,
        isDefault: wallet.isDefault,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get crypto wallets for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get unified wallet balance for a user
   * Combines both fiat and crypto balances in a single response
   */
  async getUnifiedBalance(userId: string): Promise<UnifiedWalletBalance> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          fiatAccounts: {
            where: { isActive: true },
          },
          cryptoWallets: {
            where: { isActive: true },
          },
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Get fiat balances
      const fiatBalances = await Promise.all(
        user.fiatAccounts.map(async (account) => {
          let balance = 0;

          // TODO: Integrate with actual balance APIs
          // For now, return mock balance based on currency
          if (account.currency === 'NGN') {
            balance = 50000; // Mock NGN balance
          }

          return {
            currency: account.currency,
            balance,
            accountId: account.id,
            provider: account.provider,
            isDefault: account.isDefault,
          };
        }),
      );

      // Get crypto balances
      const cryptoBalances = await Promise.all(
        user.cryptoWallets.map(async (wallet) => {
          let balance = 0;

          try {
            // TODO: Integrate with StarkNet balance queries
            // For now, return mock balance based on currency
            if (wallet.currency === 'STRK') {
              balance = 100; // Mock STRK balance
            } else if (wallet.currency === 'ETH') {
              balance = 0.5; // Mock ETH balance
            }
          } catch (error) {
            this.logger.warn(
              `Failed to fetch balance for wallet ${wallet.id}: ${error.message}`,
            );
          }

          return {
            currency: wallet.currency,
            balance,
            walletId: wallet.id,
            network: wallet.network,
            address: wallet.address,
            isDefault: wallet.isDefault,
          };
        }),
      );

      // Calculate total values (mock exchange rates)
      const exchangeRates = {
        NGN: 1,
        USD: 1600, // 1 USD = 1600 NGN
        STRK: 800, // 1 STRK = 800 NGN
        ETH: 6400000, // 1 ETH = 6,400,000 NGN
      };

      let totalValueNGN = 0;

      fiatBalances.forEach(({ currency, balance }) => {
        totalValueNGN += balance * (exchangeRates[currency] || 1);
      });

      cryptoBalances.forEach(({ currency, balance }) => {
        totalValueNGN += balance * (exchangeRates[currency] || 1);
      });

      const totalValueUSD = totalValueNGN / exchangeRates.USD;

      return {
        userId,
        fiatBalances,
        cryptoBalances,
        totalValueUSD,
        totalValueNGN,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get unified balance for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async createFiatAccount(
    userId: string,
    currency: string = 'NGN',
  ): Promise<FiatAccount> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (currency === 'NGN') {
        const monnifyData =
          await this.monnifyService.createReserveAccount(user);
        const defaultAccount = monnifyData.responseBody.accounts[0];

        return await this.prisma.fiatAccount.create({
          data: {
            userId,
            provider: 'monnify',
            currency: monnifyData.responseBody.currencyCode,
            isDefault: true,
            accountNumber: defaultAccount.accountNumber,
            accountName: defaultAccount.accountName,
            bankName: defaultAccount.bankName,
            bankCode: defaultAccount.bankCode,
            contractCode: monnifyData.responseBody.contractCode,
            accountReference: monnifyData.responseBody.accountReference,
            reservationReference: monnifyData.responseBody.reservationReference,
            reservedAccountType: monnifyData.responseBody.reservedAccountType,
            collectionChannel: monnifyData.responseBody.collectionChannel,
            customerEmail: monnifyData.responseBody.customerEmail,
            customerName: monnifyData.responseBody.customerName,
            accounts: monnifyData.responseBody.accounts,
          },
        });
      }

      throw new BadRequestException(
        `Currency ${currency} not supported for fiat accounts`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create fiat account for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  async createCryptoWallet(
    userId: string,
    currency: string = 'STRK',
  ): Promise<CryptoWallet> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Create StarkNet account
      const result = await this.contractService.createAccount(userId);

      if (!result?.accountAddress || !result?.encryptedPrivateKey) {
        throw new Error('Failed to create StarkNet account');
      }

      return await this.prisma.cryptoWallet.create({
        data: {
          userId,
          network: 'starknet',
          address: result.accountAddress,
          encryptedPrivateKey: result.encryptedPrivateKey,
          currency,
          isDefault: currency === 'STRK',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create crypto wallet for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get transaction history for unified wallet
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50,
  ): Promise<WalletTransaction[]> {
    try {
      const transactions = await this.prisma.transaction.findMany({
        where: { userId },
        include: {
          fiatAccount: true,
          cryptoWallet: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return transactions.map((tx) => ({
        id: tx.id,
        type: tx.fiatAccount ? 'fiat' : 'crypto',
        currency: tx.currency,
        amount: tx.amount,
        status: tx.status,
        reference: tx.reference,
        createdAt: tx.createdAt,
        metadata: tx.metadata,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to get transaction history for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get wallet summary for dashboard
   */
  async getWalletSummary(userId: string): Promise<any> {
    try {
      const balance = await this.getUnifiedBalance(userId);
      const recentTransactions = await this.getTransactionHistory(userId, 5);

      return {
        totalValueNGN: balance.totalValueNGN,
        totalValueUSD: balance.totalValueUSD,
        fiatAccountsCount: balance.fiatBalances.length,
        cryptoWalletsCount: balance.cryptoBalances.length,
        recentTransactions,
        hasActiveFiat: balance.fiatBalances.some((f) => f.balance > 0),
        hasActiveCrypto: balance.cryptoBalances.some((c) => c.balance > 0),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get wallet summary for user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}
