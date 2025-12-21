import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MonnifyService } from '../../payment/monnify/monnify.service';
import { Logger } from '@nestjs/common';
import { FiatAccount, CryptoWallet } from '@prisma/client';
import { ExchangeRateService } from '../exchange-rate-and-pragma/exchange-rate.service';
import { QueueWithdrawalDto } from '../../types/dto/dto/queue-withdrawal.dto';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { AccountContractService } from 'src/contract/services/account/account.service';
import { BalanceSyncService } from 'src/shared/services/balance-sync.service';
import Decimal from 'decimal.js';
import {
  toApiString,
  parseAmount,
  multiplyAmount,
  addAmounts,
} from '../../../libs/currency.utils';
import { ensureUserExists } from 'src/common/helpers/db.helper';
import {
  mapCryptoWalletWithUser,
} from 'src/common/helpers/mapper.helper';

export interface WalletSummaryResponse {
  totalBalanceNGN: number;
  totalBalanceUSD: number;
  syncTokenBalance: number;
  ethTokenBalance: number;
  strkTokenBalance: number;
  usdcTokenBalance: number;
  sngnTokenBalance: number;
  stakedSyncTokens: number;
  transactionFeeDiscount: number;
  activeLiquidityPools: number;
  dailySettlementCount: number;
}

export interface UnifiedWalletBalance {
  userId: string;
  cryptoBalances: {
    currency: string;
    balance: string;
    walletId: string;
    network: string;
    address: string;
    isDefault: boolean;
  }[];
  totalValueUSD: string;
  totalValueNGN: string;
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

  async getCryptoWallets(userId: string) {
    const wallets = await this.prisma.cryptoWallet.findMany({
      where: { userId, isActive: true },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    return wallets.map((w) => mapCryptoWalletWithUser(w as any));
  }

  async getUnifiedBalance(userId: string): Promise<UnifiedWalletBalance> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          cryptoWallets: true,
          cryptoBalances: true,
        },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Get crypto balances from database cache (FAST - no blockchain calls)
      const cryptoBalances = user.cryptoBalances.map((dbBalance) => {
        const wallet = user.cryptoWallets.find(
          (w) =>
            w.currency === dbBalance.currency &&
            w.network === dbBalance.network,
        );

        return {
          currency: dbBalance.currency,
          balance: toApiString(dbBalance.available, dbBalance.currency),
          walletId: wallet?.id || '',
          network: dbBalance.network,
          address: wallet?.address || '',
          isDefault: wallet?.isDefault || false,
        };
      });

      // Get real-time exchange rates
      const exchangeRates = await this.exchangeRateService.getExchangeRates();

      // Create a map for quick rate lookups using Decimal
      const rateMap = new Map<string, Decimal>();
      exchangeRates.forEach((rate) => {
        const key = `${rate.fiatSymbol}_${rate.tokenSymbol}`;
        rateMap.set(key, new Decimal(String(rate.rate)));
      });

      let totalValueNGN = new Decimal(0);

      // Calculate crypto balances in NGN using Decimal for precision
      cryptoBalances.forEach(({ currency, balance }) => {
        const balanceDecimal = parseAmount(balance, currency);
        const tokenToUsdRate = rateMap.get(`USD_${currency}`);
        const usdToNgnRate = rateMap.get('NGN_USD');

        if (tokenToUsdRate && usdToNgnRate) {
          // Convert crypto to USD, then USD to NGN
          const valueInUsd = multiplyAmount(
            balanceDecimal,
            tokenToUsdRate,
            'USD',
          );
          const valueInNgn = multiplyAmount(valueInUsd, usdToNgnRate, 'NGN');
          totalValueNGN = addAmounts(totalValueNGN, valueInNgn, 'NGN');
        }
      });

      // Calculate total in USD using Decimal
      const usdToNgnRate = rateMap.get('NGN_USD');
      const totalValueUSD =
        usdToNgnRate && !usdToNgnRate.isZero()
          ? totalValueNGN.div(usdToNgnRate)
          : new Decimal(0);

      this.logger.debug(
        `Unified balance retrieved from cache for user ${userId}. Crypto: ${cryptoBalances.length}`,
      );

      return {
        userId,
        cryptoBalances,
        totalValueUSD: toApiString(totalValueUSD, 'USD'),
        totalValueNGN: toApiString(totalValueNGN, 'NGN'),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get unified balance for user ${userId}:`,
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
      await ensureUserExists(this.prisma, userId);

      // Create StarkNet account
      const result = await this.accountContractService.createAccount(userId);

      if (!result?.accountAddress || !result?.encryptedPrivateKey) {
        throw new Error('Failed to create StarkNet account');
      }

      // Use transaction to ensure atomicity: create wallet + crypto balance
      return await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.cryptoWallet.create({
          data: {
            userId,
            network: 'starknet',
            address: result.accountAddress,
            encryptedPrivateKey: result.encryptedPrivateKey,
            currency,
            isDefault: currency === 'STRK',
          },
        });

        // Create or update cryptoBalance for this user/currency/network
        await tx.cryptoBalance.upsert({
          where: {
            userId_currency_network: {
              userId,
              currency,
              network: 'starknet',
            },
          },
          update: {}, // No-op if already exists
          create: {
            userId,
            currency,
            network: 'starknet',
            available: new Decimal(0),
            staked: new Decimal(0),
            pending: new Decimal(0),
          },
        });

        return wallet;
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
        amount: new Decimal(tx.amount).toNumber(),
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

      const tokenBalances = {
        STRK: 0,
        SYNC: 0,
        ETH: 0,
        USDC: 0,
        sNGN: 0,
      };

      if (defaultCryptoWallet) {
        // Use batch method to fetch all token balances in parallel
        const balances = await this.contractService.getMultipleAccountBalances(
          ['STRK', 'SYNC', 'ETH', 'USDC', 'sNGN'],
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
        totalBalanceNGN: Number(balance.totalValueNGN),
        totalBalanceUSD: Number(balance.totalValueUSD),
        syncTokenBalance: tokenBalances.SYNC,
        ethTokenBalance: tokenBalances.ETH,
        strkTokenBalance: tokenBalances.STRK,
        usdcTokenBalance: tokenBalances.USDC,
        sngnTokenBalance: tokenBalances.sNGN,
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
}
