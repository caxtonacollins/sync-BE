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
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';

export interface WalletSummaryResponse {
  totalBalanceNGN: number;
  totalBalanceUSD: number;
  syncTokenBalance: number;
  ethTokenBalance: number;
  strkTokenBalance: number;
  usdcTokenBalance: number;
  stakedSyncTokens: number;
  transactionFeeDiscount: number;
  activeLiquidityPools: number;
  dailySettlementCount: number;
}

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
    private readonly exchangeRateService: ExchangeRateService,
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
        isRegisteredToLiquidity: wallet.isRegisteredToLiquidity,
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
        // eslint-disable-next-line @typescript-eslint/await-thenable
        user.fiatAccounts.map((account) => {
          const balance = account.balance;

          // Convert from kobo to naira for NGN accounts
          const convertedBalance = account.currency === 'NGN' ? balance / 100 : balance;

          return {
            currency: account.currency,
            balance: convertedBalance,
            accountId: account.id,
            accountNumber: account.accountNumber,
            bankName: account.bankName,
            provider: account.provider,
            isDefault: account.isDefault,
          };
        }),
      );

      // Get crypto balances - Fetch all token balances for each wallet
      const cryptoBalances = await Promise.all(
        user.cryptoWallets.map(async (wallet) => {
          // Fetch balances for multiple tokens in parallel
          const tokenBalances = await this.contractService.getMultipleAccountBalances(
            ['USDC', 'STRK', 'SYNC', 'ETH'],
            wallet.address,
          );

          // Map token balances to the format expected by the frontend
          return tokenBalances.map((tokenBalance) => ({
            currency: tokenBalance.symbol,
            balance: Number(tokenBalance.formatted) || 0,
            walletId: wallet.id,
            network: wallet.network,
            address: wallet.address,
            isDefault: wallet.isDefault,
          }));
        }),
      );

      // Flatten the array of arrays
      const flattenedCryptoBalances = cryptoBalances.flat();

      // Get real-time exchange rates
      const exchangeRates = await this.exchangeRateService.getExchangeRates();

      // Create a map for quick rate lookups
      const rateMap = new Map();
      exchangeRates.forEach((rate) => {
        const key = `${rate.fiatSymbol}_${rate.tokenSymbol}`;
        rateMap.set(key, rate.rate);
      });

      let totalValueNGN = 0;

      // Calculate fiat balances in NGN
      fiatBalances.forEach(({ currency, balance }) => {
        if (currency === 'NGN') {
          totalValueNGN += balance;
        } else if (currency === 'USD') {
          const usdToNgnRate = rateMap.get('NGN_USD');
          if (usdToNgnRate) {
            totalValueNGN += balance * usdToNgnRate;
          }
        }
      });

      // Calculate crypto balances in NGN
      flattenedCryptoBalances.forEach(({ currency, balance }) => {
        const tokenToUsdRate = rateMap.get(`USD_${currency}`);
        const usdToNgnRate = rateMap.get('NGN_USD');

        if (tokenToUsdRate && usdToNgnRate) {
          // Convert crypto to USD, then USD to NGN
          const valueInUsd = Number(balance) * tokenToUsdRate;
          const valueInNgn = valueInUsd * usdToNgnRate;
          totalValueNGN += valueInNgn;
        }
      });

      // Calculate total in USD
      const totalValueUSD = totalValueNGN / rateMap.get('NGN_USD');

      return {
        userId,
        fiatBalances,
        cryptoBalances: flattenedCryptoBalances,
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

  async getWalletSummary(userId: string): Promise<WalletSummaryResponse> {
    try {
      const balance = await this.getUnifiedBalance(userId);

      // Get default crypto wallet to check token balances
      const defaultCryptoWallet = balance.cryptoBalances.find(
        (w) => w.isDefault,
      );

      let tokenBalances = {
        STRK: 0,
        SYNC: 0,
        ETH: 0,
        USDC: 0,
      };

      if (defaultCryptoWallet) {
        // Use batch method to fetch all token balances in parallel
        const balances = await this.contractService.getMultipleAccountBalances(
          ['STRK', 'SYNC', 'ETH', 'USDC'],
          defaultCryptoWallet.address,
        );

        // Map results to token balances
        balances.forEach((balance) => {
          if (balance) {
            tokenBalances[balance.symbol as keyof typeof tokenBalances] =
              Number(balance.formatted) || 0;
          }
        });
      }

      const stakedSyncTokens = 0;

      // Batch database queries in parallel
      const [activeLiquidityPools, dailySettlementCount] = await Promise.all([
        this.prisma.liquidityPool.count({
          where: {
            isActive: true,
          },
        }),
        this.prisma.transaction.count({
          where: {
            userId,
            type: 'SETTLEMENT',
            status: 'COMPLETED',
            createdAt: {
              gte: (() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return today;
              })(),
            },
          },
        }),
      ]);

      const transactionFeeDiscount = 0;

      return {
        totalBalanceNGN: balance.totalValueNGN,
        totalBalanceUSD: balance.totalValueUSD,
        syncTokenBalance: tokenBalances.SYNC,
        ethTokenBalance: tokenBalances.ETH,
        strkTokenBalance: tokenBalances.STRK,
        usdcTokenBalance: tokenBalances.USDC,
        stakedSyncTokens,
        transactionFeeDiscount,
        activeLiquidityPools,
        dailySettlementCount,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get wallet summary for user ${userId}:`,
        error,
      );
      throw error;
    }
  }

  private calculateFeeDiscount(stakedTokens: number): number {
    // Implement fee discount calculation logic based on staked tokens
    // For example: 0.1% discount per 1000 tokens staked, up to 50%
    const discountPerThousandTokens = 0.001; // 0.1%
    const maxDiscount = 0.5; // 50%
    const discount = (stakedTokens / 1000) * discountPerThousandTokens;
    return Math.min(discount, maxDiscount);
  }
}
