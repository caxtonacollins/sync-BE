import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { ApiTags } from '@nestjs/swagger';
import { TransactionService } from '../transaction/transaction.service';
import { WalletService } from '../transaction/wallet/wallet.service';
import { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { SellService } from 'src/sell/sell.service';
import { BuyService } from 'src/buy/buy.service';

@Controller('webhooks/flutterwave')
@ApiTags('Webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  private readonly prisma: PrismaClient;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    @Inject(TransactionService)
    private readonly transactionService: TransactionService,
    @Inject(WalletService)
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => SellService))
    private readonly sellService: SellService,
    @Inject(forwardRef(() => BuyService))
    private readonly buyService: BuyService,
    private readonly prismaService: PrismaService,
  ) {
    this.prisma = prismaService;
  }

  @Post('')
  @HttpCode(HttpStatus.OK)
  async handleFlutterwaveWebhook(
    @Body() payload: any,
    @Headers('verif-hash') signature: string,
  ) {
    this.logger.log('Received Flutterwave webhook', { event: payload?.event });
    try {
      // Verify the webhook signature
      const secretHash = this.configService.get(
        'FLUTTERWAVE_WEBHOOK_SECRET_HASH',
      );
      if (secretHash) {
        // Verify signature using HMAC-SHA256 of the raw payload (Flutterwave verif-hash)
        const computed = createHmac('sha256', secretHash)
          .update(JSON.stringify(payload))
          .digest('hex');
        if (signature !== computed) {
          console.error('Invalid webhook signature');
          return { status: 'error', message: 'Invalid signature' };
        }
      }

      const { event, data } = payload;

      switch (event) {
        case 'charge.completed':
          // Handle successful payment
          await this.handleSuccessfulCharge(data);
          break;

        case 'transfer.completed':
          // Handle completed transfer
          await this.handleTransferCompleted(data);
          break;

        case 'transfer.reversed':
        case 'transfer.failed':
          // Handle failed or reversed transfers
          await this.handleTransferFailed(data);
          break;

        default:
          console.log(`Unhandled event type: ${event}`);
      }

      return { status: 'success' };
    } catch (error) {
      console.error('Error processing Flutterwave webhook:', error);
      return { status: 'error', message: error.message };
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
}
