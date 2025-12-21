import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { TransactionService } from '../../transaction/transaction.service';
import { WalletService } from '../../transaction/wallet/wallet.service';
import { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';

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
      const secretHash = this.configService.get('FLUTTERWAVE_WEBHOOK_HASH');
      if (secretHash && signature !== secretHash) {
        console.error('Invalid webhook signature');
        return { status: 'error', message: 'Invalid signature' };
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
    const { id, tx_ref, amount, currency, status, customer } = data;
    
    if (!tx_ref || !customer?.id) {
      throw new BadRequestException('Invalid charge data');
    }

    // Check if transaction already exists
    const existingTx = await this.prisma.transaction.findFirst({
      where: { reference: tx_ref }
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
      currency: currency || 'NGN',
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
        const transaction = await this.transactionService.createTransaction(transactionData);
        
        // Get or create fiat account for the user
        try {
          
          this.logger.log('Successfully processed Flutterwave payment', {
            userId: customer.id,
            transactionId: transaction[0].id,
            amount,
            currency: currency || 'NGN',
            reference: tx_ref
          });
          
          return transaction[0];
        } catch (error) {
          this.logger.error('Failed to process fiat account', {
            error: error.message,
            userId: customer.id,
            reference: tx_ref
          });
          throw error;
        }
      } catch (error) {
        this.logger.error('Failed to process Flutterwave payment', {
          error: error.message,
          stack: error.stack,
          userId: customer.id,
          amount,
          reference: tx_ref
        });
        throw error;
      }
    }
    throw new Error('Transaction processing did not complete successfully');
  }

  private async handleTransferCompleted(data: any) {
    const { reference, status, amount, currency } = data;
    
    if (!reference) {
      throw new BadRequestException('Missing reference in transfer data');
    }

    // Find the transaction by reference
    const transaction = await this.prisma.transaction.findFirst({
      where: { reference }
    });
    
    if (!transaction) {
      this.logger.warn('Transaction not found for reference', { reference });
      throw new NotFoundException(`Transaction with reference ${reference} not found`);
    }
    
    // Update transaction status
    const updateData: Prisma.TransactionUpdateInput = {
      status: status === 'SUCCESSFUL' ? 'COMPLETED' : 'FAILED',
      metadata: {
        ...(transaction.metadata as object || {}),
        ...data,
        updatedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    };
    
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: updateData,
    });

    // If transfer failed, log the issue for manual review
    if (status === 'FAILED') {
      this.logger.error('Transfer failed', {
        reference,
        amount,
        currency,
        transactionId: transaction.id,
        userId: transaction.userId
      });
      
      // In a real implementation, you might want to:
      // 1. Create a support ticket
      // 2. Notify the operations team
      // 3. Potentially refund the user after investigation
    }

    return { success: true };
  }

  private async handleTransferFailed(data: any) {
    const { reference, amount, currency } = data;
    
    if (!reference) {
      throw new BadRequestException('Missing reference in transfer data');
    }
    
    // Find the transaction by reference
    const transaction = await this.prisma.transaction.findFirst({
      where: { reference }
    });
    
    if (!transaction) {
      this.logger.warn('Transaction not found for reference', { reference });
      throw new NotFoundException(`Transaction with reference ${reference} not found`);
    }
    
    // Update transaction status to failed
    const updateData: Prisma.TransactionUpdateInput = {
      status: 'FAILED',
      metadata: {
        ...(transaction.metadata as object || {}),
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
      currency,
      transactionId: transaction.id,
      userId: transaction.userId
    });

    return { success: true };
  }
}
