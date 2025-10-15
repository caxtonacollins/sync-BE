import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LiquidityPoolService {
  constructor(private readonly prisma: PrismaService) {}

  findAllPools() {
    return this.prisma.liquidityPool.findMany({ include: { history: true } });
  }

  findPoolBySymbol(symbol: string) {
    return this.prisma.liquidityPool.findUnique({
      where: { symbol },
      include: { history: true },
    });
  }

  findPoolHistory(symbol: string) {
    return this.prisma.poolHistory.findMany({
      where: { pool: { symbol } },
      orderBy: { timestamp: 'desc' },
    });
  }
}
