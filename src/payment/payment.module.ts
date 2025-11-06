import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentService } from './payment.service';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';

@Module({
  imports: [ConfigModule, PrismaModule, FlutterwaveModule],
  providers: [PaymentService, BalanceService],
  controllers: [BalanceController],
  exports: [PaymentService, BalanceService],
})
export class PaymentModule {}
