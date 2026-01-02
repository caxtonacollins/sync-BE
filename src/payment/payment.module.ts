import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BalanceService } from './balance.service';
import { BalanceController } from './balance.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { WalletModule } from 'src/transaction/wallet/wallet.module';
import { MonnifyModule } from './monnify/monnify.module';

@Module({
      imports: [
    ConfigModule,
    PrismaModule,
    forwardRef(() => FlutterwaveModule),
        forwardRef(() => WalletModule),
    MonnifyModule,
  ],
  providers: [BalanceService],
  controllers: [BalanceController],
    exports: [BalanceService, MonnifyModule, FlutterwaveModule],
})
export class PaymentModule {}
