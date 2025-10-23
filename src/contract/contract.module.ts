import { Module, forwardRef } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { LiquidityEventProcessorService } from './liquidity-event-processor.service';
import { AccountContractService } from './account-contract.service';
import { AccountFactoryContractService } from './account-factory-contract.service';
import { LiquidityPoolContractService } from './liquidity-pool-contract.service';
import { TokenContractService } from './token-contract.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { SwapOrderModule } from '../swap-order/swap-order.module';
import { UserModule } from '../user/user.module';
import { CacheModule } from '../cache/cache.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    CacheModule,
    forwardRef(() => UserModule),
    forwardRef(() => SwapOrderModule),
    forwardRef(() => ExchangeRateModule),
  ],
  controllers: [ContractController],
  providers: [
    ContractService,
    AccountContractService,
    AccountFactoryContractService,
    LiquidityPoolContractService,
    TokenContractService,
    LiquidityEventProcessorService,
    FlutterwaveService
  ],
  exports: [
    ContractService,
    AccountContractService,
    AccountFactoryContractService,
    LiquidityPoolContractService,
    TokenContractService,
    LiquidityEventProcessorService,
  ],
})
export class ContractModule {}
