import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { CryptoWallet } from '@prisma/client';
import { ExchangeRateService } from '../exchange-rate-and-pragma/exchange-rate.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { AccountContractService } from 'src/contract/services/account/account.service';
import Decimal from 'decimal.js';
import {
  toApiString,
  parseAmount,
  multiplyAmount,
  divideAmount,
} from '../../../libs/currency.utils';
import { ensureUserExists } from 'src/common/helpers/db.helper';
import {
  mapCryptoWalletWithUser,
} from 'src/common/helpers/mapper.helper';
import { UseInterceptors } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { UnifiedWalletBalance, WalletTransaction, WalletSummaryResponse } from 'src/types';

@Injectable()
  @UseInterceptors(CacheInterceptor)
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
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

      const cryptoBalances = await Promise.all(
        user.cryptoWallets.map(async (wallet) => {
          // Fetch balances for multiple tokens in parallel
          const tokenBalances = await this.contractService.getMultipleAccountBalances(
            ['USDC', 'STRK', 'sNGN', 'ETH'],
            wallet.address,
          );

          // Map token balances to the format expected by the frontend
          return tokenBalances.map((tokenBalance) => ({
            tokenSymbol: tokenBalance.symbol,
            balance: tokenBalance.formatted || '0',
            walletId: wallet.id,
            network: wallet.network,
            address: wallet.address,
            isDefault: wallet.isDefault,
          }));
        }),
      );

      // Get real-time exchange rates
      const exchangeRates = await this.exchangeRateService.getExchangeRates();

      // Create a map for quick rate lookups using Decimal
      const rateMap = new Map<string, Decimal>();
      exchangeRates.forEach((rate) => {
        const key = `${rate.fiatSymbol}_${rate.tokenSymbol}`;
        rateMap.set(key, new Decimal(String(rate.rate)));
      });

      let totalValueUSD = new Decimal(0);
      const flattenedCryptoBalances = cryptoBalances.flat();

      for (const { tokenSymbol, balance } of flattenedCryptoBalances) {
        const balanceDecimal = parseAmount(balance, tokenSymbol);

        if (tokenSymbol === 'sNGN') {
          // For sNGN, convert to USD using NGN_USD rate
          const ngnToUsdRate = rateMap.get('NGN_USD');
          if (ngnToUsdRate) {
            const valueInUsd = divideAmount(balanceDecimal, ngnToUsdRate, 'USD');
            totalValueUSD = totalValueUSD.plus(valueInUsd);
          }
        } else if (tokenSymbol === 'USDC' || tokenSymbol === 'USDT') {
          // For stablecoins, they're already in USD
          totalValueUSD = totalValueUSD.plus(balanceDecimal);
        } else {
          // For other tokens, get their USD rate
          const tokenToUsdRate = rateMap.get(`USD_${tokenSymbol}`);
          if (tokenToUsdRate) {
            const valueInUsd = multiplyAmount(balanceDecimal, tokenToUsdRate, 'USD');
                      totalValueUSD = totalValueUSD.plus(valueInUsd);
          }
        }
      }

      return {
        userId,
        cryptoBalances: flattenedCryptoBalances,
        totalValueUSD: toApiString(totalValueUSD, 'USD')
      };
    } catch (error) {
      this.logger.error(
        `Failed to get unified balance for user ${userId}:`,
        error,
      );
      throw new Error("Failed to get unified balance");
    }
  }

  async createCryptoWallet(
    userId: string,
    tokenSymbol: string = 'STRK',
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
            address: result.accountAddress!,
            encryptedPrivateKey: result.encryptedPrivateKey!,
            tokenSymbol,
            isDefault: tokenSymbol === 'STRK',
          },
        });

        // Create or update cryptoBalance for this user/tokenSymbol/network
        await tx.cryptoBalance.upsert({
          where: {
            userId_tokenSymbol_network: {
              userId,
              tokenSymbol,
              network: 'starknet',
            },
          },
          update: {}, // No-op if already exists
          create: {
            userId,
            tokenSymbol,
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
      throw new Error("Failed to create crypto wallet");
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
          cryptoWallet: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return transactions.map((tx) => ({
        id: tx.id,
        type: 'crypto',
        tokenSymbol: tx.tokenSymbol,
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
      throw new Error("Failed to get transaction history");
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
        ETH: 0,
        USDC: 0,
        sNGN: 0,
      };

      if (defaultCryptoWallet) {
        // Use batch method to fetch all token balances in parallel
        const balances = await this.contractService.getMultipleAccountBalances(
          ['STRK', 'ETH', 'USDC', 'sNGN'],
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
        totalBalanceUSD: Number(balance.totalValueUSD),
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
