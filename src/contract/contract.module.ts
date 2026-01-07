import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../transaction/wallet/wallet.module';
import { PaymentModule } from '../payment/payment.module';
import { SwapOrderModule } from '../swap-order/swap-order.module';
import { UserModule } from '../user/user.module';
import { CacheModule } from '../cache/cache.module';
import { ExchangeRateModule } from '../transaction/exchange-rate-and-pragma/exchange-rate.module';
import { LiquidityController } from './controllers/liquidity/liquidity.controller';
import { StakingController } from './controllers/staking/staking.controller';
import { AccountController } from './controllers/account/account.controller';
import { EventsController } from './controllers/events/events.controller';
import { ContractEventsController } from './controllers/events/contract-events.controller';
import { Erc20TokenController } from './controllers/erc20-token/erc20-token.controller';
import { AccountContractService } from './services/account/account.service';
import { TokenContractService } from './services/erc20-token/erc20-token.service';
import { LiquidityEventProcessorService } from './services/event-processor/event-processor.service';
import { LiquidityPoolContractService } from './services/liquidity-pool/liquidity-pool.service';
import { StakingContractService } from './services/staking/staking.service';
import { DexIntegrationService } from './services/dex/dex-integration.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { TXContractService } from './services/tx.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => WalletModule),
    CacheModule,
    forwardRef(() => UserModule),
    forwardRef(() => SwapOrderModule),
    forwardRef(() => ExchangeRateModule),
    forwardRef(() => PaymentModule),
  ],
  controllers: [
    LiquidityController,
    StakingController,
    AccountController,
    EventsController,
    ContractEventsController,
    Erc20TokenController,
  ],
  providers: [
    AccountContractService,
    TransactionService,
    LiquidityPoolContractService,
    TokenContractService,
    LiquidityEventProcessorService,
    StakingContractService,
    DexIntegrationService,
    TXContractService
  ],
  exports: [
    AccountContractService,
    LiquidityPoolContractService,
    TokenContractService,
    LiquidityEventProcessorService,
    StakingContractService,
    DexIntegrationService,
  ],
})
export class ContractModule {}
