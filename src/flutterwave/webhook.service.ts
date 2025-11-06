import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { FlutterwaveWebhookDto } from './dto/webhook.dto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly secretHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const secretHash = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    if (!secretHash) {
      throw new Error('FLUTTERWAVE_SECRET_KEY is not configured');
    }
    this.secretHash = secretHash;
  }

  validateWebhookSignature(signature: string, payload: string): boolean {
    if (!this.secretHash) {
      throw new Error('Flutterwave secret hash is not configured');
    }

    const computedSignature = createHmac('sha512', this.secretHash)
      .update(payload)
      .digest('hex');

    return computedSignature === signature;
  }

  async handleWebhook(data: FlutterwaveWebhookDto) {
    try {
      // Extract virtual account details
      const { account_number, amount, currency, tx_ref, status } = data.data;

      // Find the associated fiat account
      const fiatAccount = await this.prisma.fiatAccount.findFirst({
        where: { accountNumber: account_number },
        include: { user: true },
      });

      if (!fiatAccount) {
        throw new BadRequestException('Invalid virtual account');
      }

      // Begin transaction
      return await this.prisma.$transaction(async (tx) => {
        // Check for duplicate transaction
        const existingTransaction = await tx.transaction.findUnique({
          where: { reference: tx_ref },
        });

        if (existingTransaction) {
          this.logger.warn(`Duplicate transaction detected: ${tx_ref}`);
          return existingTransaction;
        }

        // Update account balance
        if (status === 'successful') {
          await tx.fiatAccount.update({
            where: { id: fiatAccount.id },
            data: {
              balance: { increment: amount },
              availableBalance: { increment: amount },
            },
          });
        }

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            userId: fiatAccount.userId,
            type: 'deposit',
            status: status === 'successful' ? 'completed' : 'failed',
            amount,
            currency,
            fee: 0,
            netAmount: amount,
            reference: tx_ref,
            fiatAccountId: fiatAccount.id,
            metadata: data.data,
            completedAt: status === 'successful' ? new Date() : null,
          },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            userId: fiatAccount.userId,
            action: 'VIRTUAL_ACCOUNT_CREDIT',
            entityType: 'TRANSACTION',
            entityId: transaction.id,
            metadata: {
              amount,
              currency,
              reference: tx_ref,
              accountNumber: account_number,
            },
          },
        });

        return transaction;
      });
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      throw error;
    }
  }
}
