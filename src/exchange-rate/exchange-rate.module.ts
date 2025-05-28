import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeRateController } from './exchange-rate.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService],
})
export class ExchangeRateModule {}
