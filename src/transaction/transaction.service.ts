import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TxFilterDto } from './dto/tx-filter.dto';
import { UpdateTxDto } from './dto/update-tx.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class TransactionService {
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
      status: dto.status,
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
}
