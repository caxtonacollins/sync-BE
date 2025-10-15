import { Module, forwardRef } from '@nestjs/common';
import { ExchangeRateController } from './exchange-rate.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeRateService } from './exchange-rate.service';
import { ContractService } from '../contract/contract.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { WalletModule } from '../wallet/wallet.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WalletModule),
    forwardRef(() => UserModule),
  ],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService, ContractService, FlutterwaveService],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
