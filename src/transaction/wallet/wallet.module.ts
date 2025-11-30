import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { KeyManagementService } from './key-management.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContractModule } from '../../contract/contract.module';
import { WalletController } from './wallet.controller';
import { PaymentModule } from 'src/payment/payment.module';
import { ExchangeRateModule } from '../exchange-rate-and-pragma/exchange-rate.module';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ContractModule),
    forwardRef(() => ExchangeRateModule),
    SharedModule,
    forwardRef(() => PaymentModule),
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    KeyManagementService,
  ],
  exports: [WalletService, KeyManagementService],
})
export class WalletModule {}
