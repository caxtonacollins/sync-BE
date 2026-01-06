import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { WalletService } from 'src/transaction/wallet/wallet.service';
import { BalanceService } from 'src/payment/balance.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { FlutterwaveService } from 'src/payment/flutterwave/flutterwave.service';

@Injectable()
export class SellService {
  private readonly logger = new Logger(SellService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly tokenContractService: TokenContractService,
    private readonly walletService: WalletService,
    private readonly balanceService: BalanceService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async initiateSell(userId: string, payload: any) {
    const { amount, bankAccount, currency } = payload;
    if (!amount || amount <= 0) throw new BadRequestException('Invalid amount');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Get user's crypto wallet
    const cryptoWallets = await this.walletService.getCryptoWallets(userId);
    if (!cryptoWallets || cryptoWallets.length === 0) {
      throw new BadRequestException('User has no crypto wallet');
    }

    const cryptoWallet = cryptoWallets[0];

    // Check on-chain sNGN balance
    const onchainBalance = await this.tokenContractService.getAccountBalance(
      'sNGN',
      cryptoWallet.address,
    );

    if (parseFloat(onchainBalance) < amount) {
      throw new BadRequestException('Insufficient sNGN balance');
    }

    // Create pending transaction
    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        type: 'SELL',
        status: 'PENDING',
        amount,
        tokenSymbol: 'sNGN',
        netAmount: amount,
        reference: `SELL_${Date.now()}_${userId}`,
        metadata: {
          bankAccount,
          currency,
        },
      },
    });

    try {
      // 1. Initiate fiat payout via PSP
      const payoutResult = await this.flutterwaveService.initiatePayout(
        bankAccount,
        Number(amount),
        currency || 'NGN',
      );

      // Store payout reference, set transaction.reference to payoutReference, and set processing (do NOT debit or burn yet)
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          reference: payoutResult?.reference,
          status: 'PROCESSING',
          metadata: {
            ...(tx.metadata as Record<string, any>),
            payoutReference: payoutResult?.reference || null,
            payoutData: payoutResult?.data || null,
            payoutInitiatedAt: new Date().toISOString(),
          },
        },
      });

      // The actual debit of internal balance and on-chain burn will be performed
      // by webhook handler once the transfer is confirmed to avoid race conditions.

      return {
        success: true,
        data: {
          id: tx.id,
          payoutReference: payoutResult?.reference || null,
          status: 'processing',
        },
      };
    } catch (error) {
      this.logger.error(
        'Sell initiation failed',
        error?.stack || error?.message || error,
      );

      // Update transaction to failed
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...(tx.metadata as Record<string, any>),
            error: error?.message || String(error),
          },
        },
      });

      throw error;
    }
  }

  /**
   * Finalize a sell transaction after payout confirmation
   * - Ensures idempotency
   * - Debits user's internal sNGN balance
   * - Burns sNGN tokens on-chain
   */
  async finalizeSell(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.type !== 'SELL')
      throw new BadRequestException('Transaction is not a sell');

    const metadata = (tx.metadata as Record<string, any>) || {};

    // Idempotency: if already settled or burnTx present, skip
    if (metadata?.settled || metadata?.burnTx) {
      this.logger.log(`Sell transaction ${transactionId} already finalized`);
      return { success: true, message: 'Already finalized' };
    }

    if (tx.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Transfer not completed; cannot finalize sell',
      );
    }

    try {
      // Debit internal balance (this will create a withdrawal transaction)
      await this.balanceService.debitAccount({
        userId: tx.userId,
        amount: tx.amount,
        tokenSymbol: tx.tokenSymbol || 'sNGN',
        reference: `SELL-${tx.id}`,
        metadata: { type: 'SELL_FINALIZE', sellTransactionId: tx.id },
      });

      // Get user's crypto wallet address
      const wallets = await this.walletService.getCryptoWallets(tx.userId);
      if (!wallets || wallets.length === 0) {
        throw new Error('User has no crypto wallet');
      }
      const cryptoWallet = wallets[0];

      // Burn tokens on-chain
      const burnResult = await this.tokenContractService.burnToken(
        cryptoWallet.address,
        tx.amount.toString(),
        this.tokenContractService.sngnTokenAddress,
      );

      // Update the original transaction metadata with burn tx
      const updated = await this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          metadata: {
            ...(tx.metadata as Record<string, any>),
            burnTx: burnResult.transactionHash,
            settled: true,
            settledAt: new Date().toISOString(),
          } as any,
          transactionHash: burnResult.transactionHash,
          completedAt: new Date(),
        },
      });

      // Audit
      await this.auditLogService.create({
        action: 'SELL_FINALIZED',
        entityType: 'Transaction',
        entityId: updated.id,
        user: { connect: { id: tx.userId } },
        metadata: {
          sellTransactionId: tx.id,
          burnTx: burnResult.transactionHash,
        },
      });

      this.logger.log(
        `Sell transaction ${tx.id} finalized (burn: ${burnResult.transactionHash})`,
      );

      return { success: true, data: updated };
    } catch (error) {
      this.logger.error('Failed to finalize sell', error?.message || error);

      // Mark sell transaction as failed so it can be investigated
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: 'FAILED',
          metadata: {
            ...(tx.metadata as Record<string, any>),
            finalizeError: error?.message || String(error),
          },
        },
      });

      throw error;
    }
  }
}
