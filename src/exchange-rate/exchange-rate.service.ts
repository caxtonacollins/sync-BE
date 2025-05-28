import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { ExchangeRateFilterDto } from './dto/exchange-rate-filter.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ExchangeRateService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExchangeRateDto) {
    return this.prisma.exchangeRate.create({ data: dto });
  }

  async findAll(filter: ExchangeRateFilterDto) {
    const { page = 1, limit = 10, ...where } = filter;
    const skip = (page - 1) * limit;
    const prismaWhere: Prisma.ExchangeRateWhereInput = {};

    if (where.fromCurrency) prismaWhere.fromCurrency = where.fromCurrency;
    if (where.toCurrency) prismaWhere.toCurrency = where.toCurrency;

    if (where.minRate || where.maxRate) {
      prismaWhere.rate = {};
      if (where.minRate) prismaWhere.rate.gte = where.minRate;
      if (where.maxRate) prismaWhere.rate.lte = where.maxRate;
    }

    if (where.expiresBefore || where.expiresAfter) {
      prismaWhere.expiresAt = {};
      if (where.expiresBefore) prismaWhere.expiresAt.lte = where.expiresBefore;
      if (where.expiresAfter) prismaWhere.expiresAt.gte = where.expiresAfter;
    }

    const [data, total] = await Promise.all([
      this.prisma.exchangeRate.findMany({
        where: prismaWhere,
        skip,
        take: limit,
        orderBy: { expiresAt: 'desc' },
      }),
      this.prisma.exchangeRate.count({ where: prismaWhere }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    return this.prisma.exchangeRate.findUnique({ where: { id } });
  }
}
