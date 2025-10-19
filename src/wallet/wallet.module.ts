import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { KeyManagementService } from './key-management.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MonnifyService } from '../monnify/monnify.service';
import { ContractModule } from '../contract/contract.module';
import { WalletController } from './wallet.controller';
import { ExchangeRateService } from 'src/exchange-rate/exchange-rate.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';

@Module({
  imports: [PrismaModule, forwardRef(() => ContractModule)],
  controllers: [WalletController],
  providers: [
    WalletService,
    KeyManagementService,
    MonnifyService,
    ExchangeRateService,
    FlutterwaveService
  ],
  exports: [WalletService, KeyManagementService],
})
export class WalletModule {}
