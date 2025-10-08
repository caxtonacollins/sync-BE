import { Module } from '@nestjs/common';
import { ExchangeRateController } from './exchange-rate.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeRateService } from './exchange-rate.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService],
})
export class ExchangeRateModule {}
