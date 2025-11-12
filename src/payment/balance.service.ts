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
import {
  parseAmount,
  addAmounts,
  subtractAmounts,
  validateNonNegativeAmount,
  toApiString,
  getCurrencyDecimals,
} from '../../libs/currency.utils';

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

      // Use fintech-standard currency utilities for precise calculations
      const currentBalance = new Decimal(account.balance.toString());
      const creditAmount = parseAmount(amount, account.currency);
      const newBalance = addAmounts(currentBalance, creditAmount, account.currency);

      // Update account balance using Decimal
      await tx.fiatAccount.update({
        where: { id: account.id },
        data: {
          balance: newBalance,
          availableBalance: newBalance,
        },
      });

      // Create transaction record using Decimal
      const zeroAmount = new Decimal(0);
      const transaction = await tx.transaction.create({
        data: {
          userId: account.userId,
          type: 'credit',
          status: 'completed',
          amount: creditAmount,
          currency: account.currency,
          fee: zeroAmount,
          netAmount: creditAmount,
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

      // Use fintech-standard currency utilities for precise calculations
      const currentBalance = new Decimal(account.balance.toString());
      const debitAmount = parseAmount(amount, account.currency);

      // Check for sufficient balance
      if (currentBalance.lessThan(debitAmount)) {
        throw new BadRequestException('Insufficient balance');
      }

      const newBalance = subtractAmounts(currentBalance, debitAmount, account.currency);

      // Update account balance using Decimal
      await tx.fiatAccount.update({
        where: { id: account.id },
        data: {
          balance: newBalance,
          availableBalance: newBalance,
        },
      });

      // Create transaction record using Decimal
      const zeroAmount = new Decimal(0);
      const transaction = await tx.transaction.create({
        data: {
          userId: account.userId,
          type: 'debit',
          status: 'completed',
          amount: debitAmount,
          currency: account.currency,
          fee: zeroAmount,
          netAmount: debitAmount,
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
    balance: string;
    availableBalance: string;
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

    const availableBalance = account.availableBalance ?? account.balance;

    return {
      balance: toApiString(account.balance, account.currency),
      availableBalance: toApiString(availableBalance, account.currency),
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
    const flutterwaveBalanceDecimal = parseAmount(
      flutterwaveBalance.available_balance,
      account.currency,
    );
    const currentBalance = new Decimal(account.balance.toString());

    if (!currentBalance.equals(flutterwaveBalanceDecimal)) {
      await this.prisma.fiatAccount.update({
        where: { id: account.id },
        data: {
          balance: flutterwaveBalanceDecimal,
          availableBalance: flutterwaveBalanceDecimal,
        },
      });

      // Log the reconciliation
      const difference = subtractAmounts(
        flutterwaveBalanceDecimal,
        currentBalance,
        account.currency,
      );
      await this.prisma.auditLog.create({
        data: {
          userId: account.userId,
          action: 'BALANCE_RECONCILIATION',
          entityType: 'FIAT_ACCOUNT',
          entityId: account.id,
          metadata: {
            previousBalance: toApiString(currentBalance, account.currency),
            newBalance: toApiString(flutterwaveBalanceDecimal, account.currency),
            difference: toApiString(difference, account.currency),
          },
        },
      });
    }
  }
}
