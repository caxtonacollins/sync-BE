import { Module, forwardRef } from '@nestjs/common';
import { ExchangeRateController } from './exchange-rate.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ExchangeRateService } from './exchange-rate.service';
import { ContractModule } from '../contract/contract.module';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { WalletModule } from '../wallet/wallet.module';
import { UserModule } from '../user/user.module';
import { PragmaModule } from './pragma.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ContractModule),
    forwardRef(() => WalletModule),
    forwardRef(() => UserModule),
    PragmaModule,
  ],
  controllers: [ExchangeRateController],
  providers: [ExchangeRateService, FlutterwaveService],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
