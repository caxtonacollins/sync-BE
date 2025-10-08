import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExchangeRateService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.exchangeRate.findMany();
  }

  findOne(fiatSymbol: string, tokenSymbol: string) {
    return this.prisma.exchangeRate.findUnique({
      where: { fiatSymbol_tokenSymbol: { fiatSymbol, tokenSymbol } },
    });
  }
}
