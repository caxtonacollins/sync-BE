import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { SwapOrderModule } from '../swap-order/swap-order.module';
import { UserModule } from '../user/user.module';
import { CacheModule } from '../cache/cache.module';
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { KeyManagementService } from '../wallet/key-management.service';
import { LiquidityController } from './controllers/liquidity/liquidity.controller';
import { StakingController } from './controllers/staking/staking.controller';
import { AccountFactoryController } from './controllers/account-factory/account-factory.controller';
import { AccountController } from './controllers/account/account.controller';
import { EventsController } from './controllers/events/events.controller';
import { Erc20TokenController } from './controllers/erc20-token/erc20-token.controller';
import { AccountFactoryContractService } from './services/account-factory/account-factory.service';
import { AccountContractService } from './services/account/account.service';
import { TokenContractService } from './services/erc20-token/erc20-token.service';
import { LiquidityEventProcessorService } from './services/event-processor/event-processor.service';
import { LiquidityPoolContractService } from './services/liquidity-pool/liquidity-pool.service';
import { StakingContractService } from './services/staking/staking.service';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    CacheModule,
    forwardRef(() => UserModule),
    forwardRef(() => SwapOrderModule),
    forwardRef(() => ExchangeRateModule),
  ],
  controllers: [LiquidityController, StakingController, AccountFactoryController, AccountController, EventsController, Erc20TokenController],
  providers: [
    AccountContractService,
    AccountFactoryContractService,
    LiquidityPoolContractService,
    TokenContractService,
    LiquidityEventProcessorService,
    FlutterwaveService,
    StakingContractService,
    KeyManagementService,
  ],
  exports: [
    AccountContractService,
    AccountFactoryContractService,
    LiquidityPoolContractService,
    TokenContractService,
    LiquidityEventProcessorService,
    StakingContractService,
  ],
})
export class ContractModule { }
