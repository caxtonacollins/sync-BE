import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TxFilterDto } from './dto/tx-filter.dto';
import { UpdateTxDto } from './dto/update-tx.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import Decimal from 'decimal.js';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  constructor(private prisma: PrismaService) {}

  async createTransaction(data: Prisma.TransactionCreateInput) {
    return this.prisma.$transaction([
      this.prisma.transaction.create({ data }),
      this.prisma.auditLog.create({
        data: {
          action: 'TRANSACTION_CREATED',
          entityType: 'Transaction',
          entityId: data.id,
          userId: data.user?.connect?.id,
        },
      }),
    ]);
  }

  async getTransactionsForUser(
    userId: string,
    filter: TxFilterDto,
    include: {
      fiatAccount?: boolean;
      cryptoWallet?: boolean;
      swapOrder?: boolean;
    },
  ) {
    const where: Prisma.TransactionWhereInput = { userId };

    if (filter.type) where.type = filter.type;
    if (filter.status) where.status = filter.status;
    if (filter.currency) where.currency = filter.currency;

    if (filter.minAmount || filter.maxAmount) {
      where.amount = {};
      if (filter.minAmount !== undefined) where.amount.gte = filter.minAmount;
      if (filter.maxAmount !== undefined) where.amount.lte = filter.maxAmount;
    }

     if (filter.fromDate || filter.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = new Date(filter.fromDate);
        if (filter.toDate) where.createdAt.lte = new Date(filter.toDate);
      }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include,
        skip: filter.skip,
        take: Number(filter.limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
      },
    };
  }

  async findAll(query: {
    userId?: string;
    status?: string;
    type?: string;
    currency?: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, status, type, currency, page = 1, limit = 10 } = query;

    const where: Prisma.TransactionWhereInput = {};

    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (type) where.type = type;
    if (currency) where.currency = currency;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          fiatAccount: true,
          cryptoWallet: true,
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  findOne(id: string) {
    return this.prisma.transaction.findUnique({ where: { id } });
  }

  async updateStatus(id: string, dto: UpdateTxDto) {
    const updateData: Partial<{ status: string; completedAt?: Date }> = {
    };

    // Set completedAt if status is completed
    if (dto.status === 'completed') {
      updateData.completedAt = dto.completedAt
        ? new Date(dto.completedAt)
        : new Date();
    }

    return this.prisma.transaction.update({
      where: { id },
      data: updateData,
    });
  }

  async transferFiat(senderUserId: string, recipientEmail: string, amount: number, currency: string) {
    this.logger.log(`Initiating fiat transfer from user ${senderUserId} to ${recipientEmail}`);

    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be positive.');
    }

    const sender = await this.prisma.user.findUnique({ where: { id: senderUserId }, include: { fiatAccounts: true } });
    const recipient = await this.prisma.user.findUnique({ where: { email: recipientEmail }, include: { fiatAccounts: true } });

    if (!sender || !recipient) {
      throw new NotFoundException('Sender or recipient not found.');
    }

    if (sender.id === recipient.id) {
      throw new BadRequestException('Cannot transfer to yourself.');
    }

    const senderAccount = sender.fiatAccounts.find(acc => acc.isDefault && acc.currency === currency);
    const recipientAccount = recipient.fiatAccounts.find(acc => acc.isDefault && acc.currency === currency);

    if (!senderAccount || !recipientAccount) {
      throw new NotFoundException(`Default ${currency} account not found for sender or recipient.`);
    }

    // TODO: Implement real balance check with a payment provider
    if (new Decimal(senderAccount.balance).lessThan(new Decimal(amount))) {
      throw new BadRequestException('Insufficient funds.');
    }

    const reference = `FIATTRANSFER_${Date.now()}`;

    try {
    return await this.prisma.$transaction(async (tx) => {
        // 1. Debit sender's account
        const debitTx = await tx.transaction.create({
          data: {
            userId: sender.id,
            type: 'fiat_transfer_debit',
            status: 'completed',
            amount: -amount,
            currency,
            netAmount: -amount,
            reference,
            fiatAccountId: senderAccount.id,
            completedAt: new Date(),
          }
        });

        // 2. Credit recipient's account
        const creditTx = await tx.transaction.create({
          data: {
            userId: recipient.id,
            type: 'fiat_transfer_credit',
            status: 'completed',
            amount: amount,
            currency,
            netAmount: amount,
            reference,
            fiatAccountId: recipientAccount.id,
            completedAt: new Date(),
          }
        });

        // 3. Update account balances
        // In a real app, this would be handled by webhooks from the payment provider
        await tx.fiatAccount.update({
          where: { id: senderAccount.id },
          data: { balance: { decrement: amount } },
        });

        await tx.fiatAccount.update({
          where: { id: recipientAccount.id },
          data: { balance: { increment: amount } },
        });

        this.logger.log(`Successfully transferred ${amount} ${currency} from ${sender.email} to ${recipient.email}`);

        return { debitTx, creditTx };
      });
    } catch (error) {
      this.logger.error('Fiat transfer failed', error);
      throw new Error('Fiat transfer failed.');
    }
  }
}
