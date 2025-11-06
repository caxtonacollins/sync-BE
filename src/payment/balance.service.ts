import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly config: ConfigService,
  ) {}

  async creditAccount(
    accountNumber: string,
    amount: number,
    reference: string,
    metadata?: any,
  ): Promise<Transaction> {
    return this.prisma.$transaction(async (tx) => {
      // Find the account
      const account = await tx.fiatAccount.findFirst({
        where: { accountNumber },
      });

      if (!account) {
        throw new BadRequestException('Account not found');
      }

      // Check for duplicate transaction
      const existingTransaction = await tx.transaction.findUnique({
        where: { reference },
      });

      if (existingTransaction) {
        throw new ConflictException('Duplicate transaction');
      }

      // Use Decimal.js for precise calculations
      const currentBalance = new Decimal(account.balance.toString());
      const creditAmount = new Decimal(amount.toString());
      const newBalance = currentBalance.plus(creditAmount);

      // Update account balance
      await tx.fiatAccount.update({
        where: { id: account.id },
        data: {
          balance: newBalance.toNumber(),
          availableBalance: newBalance.toNumber(),
        },
      });

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId: account.userId,
          type: 'credit',
          status: 'completed',
          amount: amount,
          currency: account.currency,
          fee: 0,
          netAmount: amount,
          reference,
          fiatAccountId: account.id,
          metadata,
          completedAt: new Date(),
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: account.userId,
          action: 'ACCOUNT_CREDIT',
          entityType: 'TRANSACTION',
          entityId: transaction.id,
          metadata: {
            amount,
            currency: account.currency,
            reference,
            accountNumber,
            previousBalance: currentBalance.toString(),
            newBalance: newBalance.toString(),
          },
        },
      });

      return transaction;
    });
  }

  async debitAccount(
    accountNumber: string,
    amount: number,
    reference: string,
    metadata?: any,
  ): Promise<Transaction> {
    return this.prisma.$transaction(async (tx) => {
      // Find the account
      const account = await tx.fiatAccount.findFirst({
        where: { accountNumber },
      });

      if (!account) {
        throw new BadRequestException('Account not found');
      }

      // Check for duplicate transaction
      const existingTransaction = await tx.transaction.findUnique({
        where: { reference },
      });

      if (existingTransaction) {
        throw new ConflictException('Duplicate transaction');
      }

      // Use Decimal.js for precise calculations
      const currentBalance = new Decimal(account.balance.toString());
      const debitAmount = new Decimal(amount.toString());

      // Check for sufficient balance
      if (currentBalance.lessThan(debitAmount)) {
        throw new BadRequestException('Insufficient balance');
      }

      const newBalance = currentBalance.minus(debitAmount);

      // Update account balance
      await tx.fiatAccount.update({
        where: { id: account.id },
        data: {
          balance: newBalance.toNumber(),
          availableBalance: newBalance.toNumber(),
        },
      });

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId: account.userId,
          type: 'debit',
          status: 'completed',
          amount: amount,
          currency: account.currency,
          fee: 0,
          netAmount: amount,
          reference,
          fiatAccountId: account.id,
          metadata,
          completedAt: new Date(),
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: account.userId,
          action: 'ACCOUNT_DEBIT',
          entityType: 'TRANSACTION',
          entityId: transaction.id,
          metadata: {
            amount,
            currency: account.currency,
            reference,
            accountNumber,
            previousBalance: currentBalance.toString(),
            newBalance: newBalance.toString(),
          },
        },
      });

      return transaction;
    });
  }

  async getBalance(accountNumber: string): Promise<{
    balance: number;
    availableBalance: number;
    currency: string;
  }> {
    const account = await this.prisma.fiatAccount.findFirst({
      where: { accountNumber },
      select: {
        balance: true,
        availableBalance: true,
        currency: true,
      },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    return {
      balance: account.balance,
      availableBalance: account.availableBalance ?? account.balance,
      currency: account.currency,
    };
  }

  async getTransactionHistory(
    accountNumber: string,
    filters: {
      startDate?: Date;
      endDate?: Date;
      type?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const account = await this.prisma.fiatAccount.findFirst({
      where: { accountNumber },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    const { startDate, endDate, type, status, page = 1, limit = 10 } = filters;

    const where: Prisma.TransactionWhereInput = {
      fiatAccountId: account.id,
      ...(startDate &&
        endDate && {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        }),
      ...(type && { type }),
      ...(status && { status }),
    };

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async transferBetweenAccounts(
    fromAccountNumber: string,
    toAccountNumber: string,
    amount: number,
  ): Promise<{ debitTx: Transaction; creditTx: Transaction }> {
    const reference = `TRANSFER_${Date.now()}`;

    return this.prisma.$transaction(async () => {
      // Debit the source account
      const debitTx = await this.debitAccount(
        fromAccountNumber,
        amount,
        `${reference}_DEBIT`,
        { transferReference: reference },
      );

      // Credit the destination account
      const creditTx = await this.creditAccount(
        toAccountNumber,
        amount,
        `${reference}_CREDIT`,
        { transferReference: reference },
      );

      return { debitTx, creditTx };
    });
  }

  async reconcileWithFlutterwave(accountNumber: string): Promise<void> {
    const account = await this.prisma.fiatAccount.findFirst({
      where: { accountNumber },
    });

    if (!account) {
      throw new BadRequestException('Account not found');
    }

    // Get balance from Flutterwave
    if (!account?.accountReference) {
      throw new BadRequestException('Account reference not found');
    }

    const flutterwaveBalance = await this.flutterwaveService.getVirtualAccount(
      account.accountReference,
    );

    if (!flutterwaveBalance) {
      throw new BadRequestException('Failed to fetch Flutterwave balance');
    }

    // Update local balance if there's a discrepancy
    if (flutterwaveBalance.available_balance !== account.balance) {
      await this.prisma.fiatAccount.update({
        where: { id: account.id },
        data: {
          balance: flutterwaveBalance.available_balance,
          availableBalance: flutterwaveBalance.available_balance,
        },
      });

      // Log the reconciliation
      await this.prisma.auditLog.create({
        data: {
          userId: account.userId,
          action: 'BALANCE_RECONCILIATION',
          entityType: 'FIAT_ACCOUNT',
          entityId: account.id,
          metadata: {
            previousBalance: account.balance,
            newBalance: flutterwaveBalance.available_balance,
            difference: flutterwaveBalance.available_balance - account.balance,
          },
        },
      });
    }
  }
}
