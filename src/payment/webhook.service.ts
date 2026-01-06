import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { FlutterwaveWebhookDto } from 'src/types/dto/flutterwave/webhook.dto';
import { TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import { BalanceService } from './balance.service';
import * as crypto from 'crypto';
import { BuyService } from 'src/buy/buy.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly secretHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly balanceService: BalanceService,
    private readonly buyService: BuyService,
  ) {
    const secretHash = this.config.get<string>(
      'FLUTTERWAVE_WEBHOOK_SECRET_HASH',
    );
    if (!secretHash) {
      throw new Error('FLUTTERWAVE_WEBHOOK_SECRET_HASH is not configured');
    }
    this.secretHash = secretHash;
  }

  validateWebhookSignature(
    signature: string,
    payload: string | object,
  ): boolean {
    if (!this.secretHash) {
      throw new InternalServerErrorException(
        'Webhook secret hash is not configured',
      );
    }

    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const payloadString =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    const computedSignature = createHmac('sha256', this.secretHash)
      .update(payloadString)
      .digest('hex');

    const isValid = computedSignature === signature;
    if (!isValid) {
      this.logger.warn('Invalid webhook signature', {
        computedSignature,
        receivedSignature: signature,
      });
    }

    return isValid;
  }

  async handleWebhook(payload: any, signature?: string) {
    this.logger.log('Received webhook payload', { event: payload?.event });

    try {
      // Validate webhook signature if signature is provided
      if (signature) {
        const isValid = this.validateWebhookSignature(signature, payload);
        if (!isValid) {
          throw new ForbiddenException('Invalid webhook signature');
        }
      } else {
        this.logger.warn(
          'Webhook called without signature, proceeding with caution',
        );
      }

      // Handle different webhook event types
      switch (payload?.event) {
        case 'charge.completed':
          return this.handleChargeCompleted(payload);
        case 'transfer.completed':
          return this.handleTransferCompleted(payload);
        default:
          this.logger.warn(`Unhandled webhook event: ${payload?.event}`, {
            payload,
          });
          return {
            status: 'success',
            message: 'Webhook received but no action taken',
          };
      }
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      throw error;
    }
  }

  private async handleBuy(payload: any, signature?: string) {
    console.log('payload, webhook hit', payload);
    // Verify webhook signature using header value passed from controller
    const secret =
      process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH ||
      process.env.FLUTTERWAVE_SECRET_HASH;
    const signatureHeader =
      signature || payload.headers?.['verif-hash'] || payload.signature; // backward compat

    if (secret) {
      const hash = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      if (hash !== signatureHeader) {
        throw new Error('Invalid webhook signature');
      }
    }

    const { tx_ref, status, transaction_id, amount } = payload.data;

    // Get transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: tx_ref.replace('BUY-', '') },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Update transaction status
    if (status === 'successful') {
      await this.buyService.completeBuy(transaction.id, {
        flutterwaveTransactionId: transaction_id,
        amountPaid: amount,
      });
    } else if (['failed', 'cancelled'].includes(status)) {
      await this.buyService.failBuy(transaction.id, {
        status: 'FAILED',
        failureReason: payload.data.processor_response || 'Payment failed',
      });
    }

    return { success: true };
  }

  private async handleChargeCompleted(payload: FlutterwaveWebhookDto) {
    const { data } = payload;
    const {
      account_number,
      amount,
      tokenSymbol,
      tx_ref,
      status,
      id: transactionId,
    } = data;

    this.logger.log(`Processing charge.completed webhook`, {
      transactionId,
      accountNumber: account_number,
      amount,
      tokenSymbol,
      status,
    });

    return this.prisma.$transaction(async (tx) => {
      // Check for duplicate transaction
      const existingTransaction = await tx.transaction.findUnique({
        where: { reference: tx_ref },
      });

      if (existingTransaction) {
        this.logger.warn(`Duplicate transaction detected`, {
          reference: tx_ref,
          transactionId: existingTransaction.id,
        });
        return existingTransaction;
      }

      // Find the crypto wallet by the account number (mapped to wallet address)
      const cryptoWallet = await tx.cryptoWallet.findFirst({
        where: {
          address: account_number,
          tokenSymbol,
        },
      });

      if (!cryptoWallet) {
        throw new BadRequestException(
          `No crypto wallet found for address: ${account_number}`,
        );
      }

      // Only process successful transactions
      if (status !== 'successful') {
        this.logger.warn(
          `Received non-successful transaction status: ${status}`,
          {
            transactionId,
            reference: tx_ref,
          },
        );
        return null;
      }

      try {
        // Update crypto balance
        await tx.cryptoBalance.upsert({
          where: {
            userId_tokenSymbol_network: {
              userId: cryptoWallet.userId,
              tokenSymbol,
              network: cryptoWallet.network,
            },
          },
          update: {
            available: { increment: amount },
            updatedAt: new Date(),
          },
          create: {
            userId: cryptoWallet.userId,
            tokenSymbol,
            network: cryptoWallet.network,
            available: amount,
            staked: 0,
            pending: 0,
          },
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId: cryptoWallet.userId,
            type: 'DEPOSIT',
            status: 'COMPLETED',
            amount,
            tokenSymbol,
            fee: 0,
            netAmount: amount,
            reference: tx_ref,
            completedAt: new Date(),
            cryptoWalletId: cryptoWallet.id,
          },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            userId: cryptoWallet.userId,
            action: 'CRYPTO_DEPOSIT',
            entityType: 'TRANSACTION',
            entityId: transaction.id,
            metadata: {
              amount,
              tokenSymbol,
              reference: tx_ref,
              walletAddress: cryptoWallet.address,
              transactionId,
              network: cryptoWallet.network,
            },
          },
        });

        // Update user's balance using the balance service if needed
        await this.balanceService.creditAccount({
          userId: cryptoWallet.userId,
          amount,
          tokenSymbol,
          reference: tx_ref,
          metadata: {
            transactionId: transaction.id,
            walletId: cryptoWallet.id,
            network: cryptoWallet.network,
          },
        });

        return transaction;
      } catch (error) {
        this.logger.error('Error processing charge.completed webhook:', error);
        throw error;
      }
    });
  }

  private async handleTransferCompleted(payload: any) {
    // Implement transfer completion logic here
    this.logger.log('Processing transfer.completed webhook', {
      transferId: payload?.data?.id,
    });

    return { status: 'success', message: 'Transfer webhook received' };
  }

  private async recordFailedTransaction(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      cryptoWalletId: string;
      amount: number;
      tokenSymbol: string;
      reference: string;
      metadata: any;
      status: TransactionStatus;
    },
  ) {
    return tx.transaction.create({
      data: {
        userId: params.userId,
        type: TransactionType.DEPOSIT,
        status: params.status,
        amount: params.amount,
        tokenSymbol: params.tokenSymbol,
        fee: 0,
        netAmount: params.amount,
        reference: params.reference,
        cryptoWalletId: params.cryptoWalletId,
        metadata: params.metadata,
      },
    });
  }

  private mapTransactionStatus(status: string): TransactionStatus {
    switch (status?.toLowerCase()) {
      case 'successful':
        return TransactionStatus.COMPLETED;
      case 'pending':
        return TransactionStatus.PENDING;
      case 'failed':
      case 'cancelled':
        return TransactionStatus.FAILED;
      default:
        return TransactionStatus.FAILED;
    }
  }
}
