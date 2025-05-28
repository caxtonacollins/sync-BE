import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSwapOrderDto } from './dto/create-swap-order.dto';
import { UpdateSwapOrderDto } from './dto/update-swap-order.dto';
import { SwapOrderFilterDto } from './dto/swap-order-filter.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SwapOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSwapOrderDto) {
    return this.prisma.swapOrder.create({
      data: { ...dto, fee: dto.fee ?? 0 },
    });
  }

  async findAll(filter: SwapOrderFilterDto) {
    const { page = 1, limit = 10, ...where } = filter;
    const skip = (page - 1) * limit;
    const prismaWhere: Prisma.SwapOrderWhereInput = {};
    if (where.fromCurrency) prismaWhere.fromCurrency = where.fromCurrency;
    if (where.toCurrency) prismaWhere.toCurrency = where.toCurrency;
    if (where.status) prismaWhere.status = where.status;
    if (where.userId) prismaWhere.userId = where.userId;
    if (where.minAmount || where.maxAmount) {
      prismaWhere.fromAmount = {};
      if (where.minAmount) prismaWhere.fromAmount.gte = where.minAmount;
      if (where.maxAmount) prismaWhere.fromAmount.lte = where.maxAmount;
    }

    const [data, total] = await Promise.all([
      await this.prisma.swapOrder.findMany({
        where: prismaWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.swapOrder.count({ where: prismaWhere }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    return await this.prisma.swapOrder.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateSwapOrderDto) {
    const { userId, ...rest } = dto;
    const updateData: Prisma.SwapOrderUpdateInput = {
      ...rest,
      ...(userId ? { userId: String(userId) } : {}),
    };

    return this.prisma.swapOrder.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    return await this.prisma.swapOrder.delete({ where: { id } });
  }
}
