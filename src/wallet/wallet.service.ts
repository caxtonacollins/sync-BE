import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MonnifyService } from '../monnify/monnify.service';
import { Logger } from '@nestjs/common';
import { FiatAccount, CryptoWallet, Transaction } from '@prisma/client';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { QueueWithdrawalDto } from './dto/queue-withdrawal.dto';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { AccountContractService } from 'src/contract/services/account/account.service';

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
    @Inject(forwardRef(() => TokenContractService))
    private readonly contractService: TokenContractService,
    @Inject(forwardRef(() => AccountContractService))
    private readonly accountContractService: AccountContractService,
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
      const result = await this.accountContractService.createAccount(userId);

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

  /**
   * Calculate the withdrawal fee for a given amount and currency
   * @param amount The amount to withdraw
   * @param currency The currency of the withdrawal
   * @returns The calculated fee amount
   */
  private calculateWithdrawalFee(amount: number, currency: string): number {
    // Define fee structure by currency
    const feeStructure = {
      NGN: (amount: number) => Math.min(100, Math.max(10, amount * 0.01)), // 1% with min 10 and max 100 NGN
      USD: (amount: number) => Math.min(10, Math.max(1, amount * 0.01)),   // 1% with min 1 and max 10 USD
      GBP: (amount: number) => Math.min(8, Math.max(0.8, amount * 0.01)),  // 1% with min 0.8 and max 8 GBP
      GHS: (amount: number) => Math.min(50, Math.max(5, amount * 0.01)),   // 1% with min 5 and max 50 GHS
      default: (amount: number) => amount * 0.01, // 1% for other currencies
    };

    const calculateFee = feeStructure[currency] || feeStructure.default;
    return calculateFee(amount);
  }

  /**
   * Get the current bank balance for a specific currency
   * @param currency The currency code (e.g., 'NGN', 'USD')
   * @returns The current bank balance in the specified currency
   */
  async getBankBalance(currency: string): Promise<number> {
    try {
      // In a real implementation, this would call your banking provider's API
      // For example, using Monnify or another payment processor
      // Since getAccountBalance doesn't exist, we'll use a placeholder implementation
      // that sums up the balances from the database as a fallback
      
      // Get the sum of all fiat balances for this currency
      const result = await this.prisma.fiatBalance.aggregate({
        where: { currency },
        _sum: {
          available: true,
        },
      });
      
      // Convert Decimal to number
      return result._sum.available?.toNumber() || 0;
      
    } catch (error) {
      this.logger.error(`Failed to get bank balance for ${currency}:`, error);
      
      // In a real app, you might want to implement a fallback mechanism here,
      // such as checking a cached balance or using a different provider
      
      // For now, we'll rethrow the error
      throw new Error(`Failed to retrieve bank balance: ${error.message}`);
    }
  }

  /**
   * Queue a large withdrawal request for manual processing
   * @param userId The ID of the user requesting the withdrawal
   * @param dto The withdrawal request details
   * @returns The created withdrawal request
   */
  async queueLargeWithdrawal(
    userId: string,
    dto: QueueWithdrawalDto,
  ) {
    // 1. Validate the user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 2. Check if user has sufficient balance
    const balance = await this.prisma.fiatBalance.findUnique({
      where: {
        userId_currency: {
          userId,
          currency: dto.currency,
        },
      },
    });

    // Convert Decimal to number for comparison
    const availableBalance = balance?.available?.toNumber() || 0;
    if (!balance || availableBalance < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // 3. Check if currency is supported
    const supportedCurrencies = ['NGN', 'USD', 'GBP', 'GHS'];
    if (!supportedCurrencies.includes(dto.currency)) {
      throw new BadRequestException(`Currency ${dto.currency} is not supported for large withdrawals`);
    }

    // 4. Check if amount is above threshold for manual processing
    const largeWithdrawalThresholds = {
      NGN: 500000, // 500,000 NGN
      USD: 1000,   // 1,000 USD
      GBP: 800,    // 800 GBP
      GHS: 10000,  // 10,000 GHS
    };

    const threshold = largeWithdrawalThresholds[dto.currency] || 0;
    if (dto.amount <= threshold) {
      throw new BadRequestException(
        `Amount is below the threshold for large withdrawals. Please use the standard withdrawal process.`,
      );
    }

    // 5. Create the withdrawal request
    // First, we need to create a transaction record with all required fields
    const reference = `WDR-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    const fee = this.calculateWithdrawalFee(dto.amount, dto.currency);
    
    // Create the transaction first
    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        type: 'WITHDRAWAL',
        status: 'PENDING',
        amount: dto.amount,
        netAmount: dto.amount - fee,
        currency: dto.currency,
        fee,
        reference,
        metadata: {
          isLargeWithdrawal: true,
          withdrawalMethod: dto.withdrawalMethod,
          destinationAddress: dto.destinationAddress,
          bankAccountId: dto.bankAccountId,
        },
      },
    });
    
    // Then create the withdrawal request linked to the transaction
    const withdrawalData = {
      userId,
      amount: dto.amount,
      currency: dto.currency,
      status: 'PENDING',
      reason: dto.reason || 'Large withdrawal request',
      transactionId: transaction.id,
      metadata: {
        ...dto.metadata,
        withdrawalMethod: dto.withdrawalMethod,
        destinationAddress: dto.destinationAddress,
        bankAccountId: dto.bankAccountId,
      },
    };
    
    // Use Prisma's create method with raw SQL as a fallback
    let withdrawalRequest;
    try {
      // First try the standard Prisma way if the model is available
      withdrawalRequest = await this.prisma.withdrawalRequest.create({
        data: {
          userId: withdrawalData.userId,
          amount: withdrawalData.amount,
          currency: withdrawalData.currency,
          status: withdrawalData.status,
          reason: withdrawalData.reason,
          transactionId: withdrawalData.transactionId,
          metadata: withdrawalData.metadata as any,
        },
      });
    } catch (error) {
      // If the model isn't available yet, use raw SQL
      if (error.code === 'P2001' || error.message.includes('does not exist')) {
        const result = await this.prisma.$queryRaw`
          INSERT INTO "WithdrawalRequest" (
            "id", "userId", "amount", "currency", "status", "reason", 
            "transactionId", "metadata", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(), 
            ${withdrawalData.userId}, 
            ${withdrawalData.amount}, 
            ${withdrawalData.currency}, 
            ${withdrawalData.status}, 
            ${withdrawalData.reason},
            ${withdrawalData.transactionId},
            ${withdrawalData.metadata}::jsonb,
            NOW(), 
            NOW()
          )
          RETURNING *
        `;
        withdrawalRequest = Array.isArray(result) ? result[0] : result;
      } else {
        throw error;
      }
    }

    // 6. Update the transaction with the withdrawal request ID
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          ...(transaction.metadata as object || {}),
          withdrawalRequestId: withdrawalRequest.id,
        },
      },
    });

    // 7. Send notification to admin for manual processing
    await this.sendWithdrawalNotificationToAdmin(withdrawalRequest);

    return withdrawalRequest;
  }

  /**
   * Helper method to send notification to admin about a new large withdrawal request
   */
  private async sendWithdrawalNotificationToAdmin(withdrawalRequest: any) {
    try {
      // In a real implementation, this would send an email or notification to the admin
      // For example:
      // await this.notificationService.sendToAdmin({
      //   type: 'LARGE_WITHDRAWAL_REQUEST',
      //   title: 'New Large Withdrawal Request',
      //   message: `A new large withdrawal request of ${withdrawalRequest.amount} ${withdrawalRequest.currency} has been submitted.`,
      //   data: withdrawalRequest,
      // });
      
      this.logger.log(
        `Large withdrawal request created: ${withdrawalRequest.id} for ${withdrawalRequest.amount} ${withdrawalRequest.currency}`,
      );
    } catch (error) {
      this.logger.error('Failed to send withdrawal notification to admin:', error);
      // Don't throw the error as we don't want to fail the withdrawal request
    }
  }
}
