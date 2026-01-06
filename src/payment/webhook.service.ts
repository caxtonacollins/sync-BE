import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import { BuyService } from 'src/buy/buy.service';
import Decimal from 'decimal.js';
import { SellService } from 'src/sell/sell.service';
import { TransactionService } from 'src/transaction/transaction.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly secretHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly transactionService: TransactionService,
    private readonly sellService: SellService,
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

  async handleWebhook(payload: any, signature?: string) {
    this.logger.log('Received webhook payload', { event: payload?.event });

    try {
      if (!signature || signature !== this.secretHash) {
        this.logger.error('Invalid webhook signature');
        return { status: 'error', message: 'Invalid signature' };
      }

      switch (payload.event) {
        case 'charge.completed':
            // Handle successful payment
            await this.handleSuccessfulCharge(payload.data);
            break;

        case 'transfer.completed':
            // Handle completed transfer
            await this.handleTransferCompleted(payload.data);
            break;

          case 'transfer.reversed':
          case 'transfer.failed':
            // Handle failed or reversed transfers
            await this.handleTransferFailed(payload.data);
            break;

        default:
            console.log(`Unhandled event type: ${payload.event}`);
      }

      return { status: 'success' };
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      throw error;
    }
  }

  private async handleSuccessfulCharge(data: any) {
    const { id, tx_ref, amount, tokenSymbol, status, customer } = data;

    if (!tx_ref) {
      throw new BadRequestException('Invalid charge data: missing tx_ref');
    }

    // If this is a BUY flow (we set tx_ref as BUY-{transactionId}), delegate to BuyService
    if (tx_ref.startsWith('BUY-')) {
      const transactionId = tx_ref.replace('BUY-', '');
      if (status === 'successful') {
        await this.buyService.completeBuy(transactionId, {
          flutterwaveTransactionId: id,
          amountPaid: amount,
        });
        this.logger.log('Processed BUY webhook and completed transaction', {
          tx_ref,
        });
        return { success: true };
      } else if (['failed', 'cancelled'].includes(status)) {
        await this.buyService.failBuy(transactionId, {
          status: 'FAILED',
          failureReason: data?.processor_response || 'Payment failed',
        });
        this.logger.log('Processed BUY webhook and marked transaction failed', {
          tx_ref,
        });
        return { success: true };
      }
    }

    // For non-BUY flows, require customer.id to exist
    if (!customer?.id) {
      throw new BadRequestException('Invalid charge data: missing customer id');
    }

    // Check if transaction already exists (idempotency)
    const existingTx = await this.prisma.transaction.findFirst({
      where: { reference: tx_ref },
    });

    if (existingTx) {
      this.logger.log('Transaction already processed', { reference: tx_ref });
      return existingTx;
    }

    // Create transaction record with required fields
    const amountDecimal = new Decimal(amount);
    const fee = new Decimal(0); // Assuming no fee for deposits, adjust if needed
    const netAmount = amountDecimal.minus(fee);

    const transactionData: Prisma.TransactionCreateInput = {
      user: { connect: { id: customer.id } },
      amount: amountDecimal,
      netAmount: netAmount,
      fee: fee,
      tokenSymbol: tokenSymbol || 'NGN',
      status: status === 'successful' ? 'COMPLETED' : 'FAILED',
      type: 'DEPOSIT',
      reference: tx_ref,
      metadata: {
        flutterwaveTransactionId: id,
        customer,
        verifiedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    };

    // Update wallet balance if transaction is successful
    if (status === 'successful') {
      try {
        // Create the transaction record
        const transaction =
          await this.transactionService.createTransaction(transactionData);

        // Get or create fiat account for the user
        try {
          this.logger.log('Successfully processed Flutterwave payment', {
            userId: customer.id,
            transactionId: transaction[0].id,
            amount,
            tokenSymbol: tokenSymbol || 'NGN',
            reference: tx_ref,
          });

          return transaction[0];
        } catch (error) {
          this.logger.error('Failed to process fiat account', {
            error: error.message,
            userId: customer.id,
            reference: tx_ref,
          });
          throw error;
        }
      } catch (error) {
        this.logger.error('Failed to process Flutterwave payment', {
          error: error.message,
          stack: error.stack,
          userId: customer.id,
          amount,
          reference: tx_ref,
        });
        throw error;
      }
    }
    throw new Error('Transaction processing did not complete successfully');
  }

  private async handleTransferCompleted(data: any) {
    const { reference, status, amount, tokenSymbol } = data;

    if (!reference) {
      throw new BadRequestException('Missing reference in transfer data');
    }

    // Find the transaction by reference
    let transaction = await this.prisma.transaction.findFirst({
      where: { reference },
    });

    // If not found, attempt to find transaction by payoutReference inside metadata
    if (!transaction) {
      this.logger.debug(
        'Transaction not found by reference; attempting metadata lookup',
        { reference },
      );
      try {
        const rows: any = await this.prisma.$queryRaw`
          SELECT * FROM "Transaction" WHERE (metadata ->> 'payoutReference') = ${reference} LIMIT 1
        `;
        if (rows && rows.length > 0) {
          const row = rows[0];
          transaction = await this.prisma.transaction.findUnique({
            where: { id: row.id },
          });
        }
      } catch (err) {
        this.logger.error('Raw lookup for transaction by metadata failed', {
          error: err?.message || err,
        });
      }
    }

    if (!transaction) {
      this.logger.warn('Transaction not found for reference', { reference });
      throw new NotFoundException(
        `Transaction with reference ${reference} not found`,
      );
    }

    // Update transaction status
    const updateData: Prisma.TransactionUpdateInput = {
      status: status === 'SUCCESSFUL' ? 'COMPLETED' : 'FAILED',
      metadata: {
        ...((transaction.metadata as object) || {}),
        ...data,
        updatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    };

    const updatedTx = await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: updateData,
    });

    // If transfer succeeded and this was a SELL, finalize the sell (debit + burn)
    if (status === 'SUCCESSFUL' && transaction.type === 'SELL') {
      try {
        await this.sellService.finalizeSell(transaction.id);
      } catch (error) {
        this.logger.error(
          'Failed to finalize sell after transfer confirmation',
          {
            error: error?.message || error,
            transactionId: transaction.id,
          },
        );
        // Don't throw here - webhook should return OK so provider won't retry excessively
      }
    }

    // If transfer failed, log the issue for manual review
    if (status === 'FAILED') {
      this.logger.error('Transfer failed', {
        reference,
        amount,
        tokenSymbol,
        transactionId: transaction.id,
        userId: transaction.userId,
      });

      // In a real implementation, you might want to:
      // 1. Create a support ticket
      // 2. Notify the operations team
      // 3. Potentially refund the user after investigation
    }

    return { success: true };
  }

  private async handleTransferFailed(data: any) {
    const { reference, amount, tokenSymbol } = data;

    if (!reference) {
      throw new BadRequestException('Missing reference in transfer data');
    }

    // Find the transaction by reference
    let transaction = await this.prisma.transaction.findFirst({
      where: { reference },
    });

    // If not found, attempt to find transaction by payoutReference inside metadata
    if (!transaction) {
      this.logger.debug(
        'Transaction not found by reference (failed handler); attempting metadata lookup',
        { reference },
      );
      try {
        const rows: any = await this.prisma.$queryRaw`
          SELECT * FROM "Transaction" WHERE (metadata ->> 'payoutReference') = ${reference} LIMIT 1
        `;
        if (rows && rows.length > 0) {
          const row = rows[0];
          transaction = await this.prisma.transaction.findUnique({
            where: { id: row.id },
          });
        }
      } catch (err) {
        this.logger.error(
          'Raw lookup for transaction by metadata failed (failed handler)',
          { error: err?.message || err },
        );
      }
    }

    if (!transaction) {
      this.logger.warn('Transaction not found for reference', { reference });
      throw new NotFoundException(
        `Transaction with reference ${reference} not found`,
      );
    }

    // Update transaction status to failed
    const updateData: Prisma.TransactionUpdateInput = {
      status: 'FAILED',
      metadata: {
        ...((transaction.metadata as object) || {}),
        ...data,
        updatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    };

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: updateData,
    });

    // Log the failure for manual review
    this.logger.error('Transfer failed', {
      reference,
      amount,
      tokenSymbol,
      transactionId: transaction.id,
      userId: transaction.userId,
    });

    return { success: true };
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
