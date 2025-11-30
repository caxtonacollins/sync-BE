import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { KeyManagementService } from './key-management.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { MonnifyService } from '../../payment/monnify/monnify.service';
import { ContractModule } from '../../contract/contract.module';
import { WalletController } from './wallet.controller';
import { FlutterwaveService } from '../../payment/flutterwave/flutterwave.service';
import { ExchangeRateModule } from '../exchange-rate-and-pragma/exchange-rate.module';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ContractModule),
    forwardRef(() => ExchangeRateModule),
    SharedModule,
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    KeyManagementService,
    MonnifyService,
    FlutterwaveService,
  ],
  exports: [WalletService, KeyManagementService],
})
export class WalletModule {}
