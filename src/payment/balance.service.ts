import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  Transaction as PrismaTransaction,
  TransactionType,
  TransactionStatus,
  Prisma
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FlutterwaveService } from './flutterwave/flutterwave.service';
import Decimal from 'decimal.js';


interface CreditAccountParams {
  userId: string;
  amount: Decimal.Value;
  tokenSymbol: string;
  reference: string;
  type?: TransactionType;
  metadata?: Record<string, any>;
  network?: string;
}

@Injectable()
export class BalanceService {

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FlutterwaveService))
    private readonly flutterwaveService: FlutterwaveService,
  ) { }

  /**
   * Credits a user's account with the specified amount
   * @param params Credit account parameters
   * @returns The created transaction
   */
  async creditAccount(params: CreditAccountParams): Promise<PrismaTransaction> {
    const {
      userId,
      amount: amountValue,
      tokenSymbol,
      reference,
      type = TransactionType.DEPOSIT,
      metadata = {},
      network = 'starknet',
    } = params;

    const amount = new Decimal(amountValue);

    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    return this.prisma.$transaction(async (tx) => {
      // Check for duplicate transaction
      const existingTransaction = await tx.transaction.findUnique({
        where: { reference },
      });

      if (existingTransaction) {
        throw new ConflictException('Duplicate transaction');
      }

      // Find or create the user's balance record
      let balance = await tx.cryptoBalance.findFirst({
        where: {
          userId,
          tokenSymbol,
          network,
        },
      });

      if (!balance) {
        // Create a new balance record if it doesn't exist
        balance = await tx.cryptoBalance.create({
          data: {
            userId,
            tokenSymbol,
            network,
            available: 0,
            staked: 0,
            pending: 0,
          },
        });
      }

      // Calculate new available balance
      const newAvailable = new Decimal(balance.available).plus(amount).toNumber();

      // Update the balance
      await tx.cryptoBalance.update({
        where: { id: balance.id },
        data: {
          available: newAvailable,
        },
      });

      // Create the transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type,
          status: TransactionStatus.COMPLETED,
          amount: amount.toNumber(),
          tokenSymbol,
          fee: 0, // You might want to calculate fees based on your business logic
          netAmount: amount.toNumber(),
          reference,
          metadata: metadata || {},
          completedAt: new Date(),
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ACCOUNT_CREDIT',
          entityType: 'TRANSACTION',
          entityId: transaction.id,
          metadata: {
            amount: amount.toString(),
            tokenSymbol,
            reference,
            previousBalance: balance.available.toString(),
            newBalance: newAvailable.toString(),
          },
        },
      });

      return transaction;
    });
  }

  /**
   * Debits a user's account with the specified amount
   * @param params Debit account parameters
   * @returns The created transaction
   */
  async debitAccount(params: Omit<CreditAccountParams, 'type'>): Promise<PrismaTransaction> {
    const {
      userId,
      amount: amountValue,
      tokenSymbol,
      reference,
      metadata = {},
      network = 'starknet',
    } = params;

    const amount = new Decimal(amountValue);

    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }

    return this.prisma.$transaction(async (tx) => {
      // Check for duplicate transaction
      const existingTransaction = await tx.transaction.findUnique({
        where: { reference },
      });

      if (existingTransaction) {
        throw new ConflictException('Duplicate transaction');
      }

      // Find the user's balance record
      const balance = await tx.cryptoBalance.findFirst({
        where: {
          userId,
          tokenSymbol,
          network,
        },
      });

      if (!balance) {
        throw new BadRequestException('Insufficient balance');
      }

      // Check if there's enough available balance
      if (new Decimal(balance.available).lessThan(amount)) {
        throw new BadRequestException('Insufficient balance');
      }

      // Calculate new available balance
      const newAvailable = new Decimal(balance.available).minus(amount).toNumber();

      // Update the balance
      await tx.cryptoBalance.update({
        where: { id: balance.id },
        data: {
          available: newAvailable,
        },
      });

      // Create the transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.COMPLETED,
          amount: amount.toNumber(),
          netAmount: amount.toNumber(),
          tokenSymbol,
          fee: 0, // You might want to calculate fees based on your business logic
          reference: '', // Add a reference if needed
          metadata: {} as Prisma.InputJsonValue, // Add metadata if needed
        },
      });

      // Log the transaction
      await tx.auditLog.create({
        data: {
          action: 'DEBIT',
          entityType: 'CRYPTO_BALANCE',
          entityId: balance.id,
          userId,
          metadata: {
            amount: amount.toString(),
            tokenSymbol,
            previousAvailable: balance.available.toString(),
            newAvailable: newAvailable.toString(),
          } as Prisma.InputJsonValue,
        },
      });

      return transaction;
    });
  }

  async getBalance(userId: string): Promise<Decimal> {
    const balance = await this.prisma.cryptoBalance.findFirst({
      where: {
        userId,
      },
    });
    return balance?.available || new Decimal(0);
  }

  async transferBetweenAccounts(fromUserId: string, toUserId: string, amount: Decimal.Value, tokenSymbol: string) {
    const fromUserBalance = await this.getBalance(fromUserId);
    const toUserBalance = await this.getBalance(toUserId);

    if (fromUserBalance.lessThan(amount)) {
      throw new BadRequestException('Insufficient balance');
    }

    await this.debitAccount({
      userId: fromUserId,
      amount,
      tokenSymbol,
      reference: 'transfer',
    });

    await this.creditAccount({
      userId: toUserId,
      amount,
      tokenSymbol,
      reference: 'transfer',
    });

    return { message: 'Transfer successful' };  
  }
}
