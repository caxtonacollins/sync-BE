import { Module, forwardRef } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { LiquidityEventProcessorService } from './liquidity-event-processor.service';
import { BlockchainCacheService } from './blockchain-cache.service';
import { AccountContractService } from './account-contract.service';
import { AccountFactoryContractService } from './account-factory-contract.service';
import { LiquidityPoolContractService } from './liquidity-pool-contract.service';
import { TokenContractService } from './token-contract.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { SwapOrderModule } from '../swap-order/swap-order.module';
import { UserModule } from '../user/user.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    CacheModule,
    forwardRef(() => UserModule),
    forwardRef(() => SwapOrderModule),
  ],
  controllers: [ContractController],
  providers: [
    ContractService,
    AccountContractService,
    AccountFactoryContractService,
    LiquidityPoolContractService,
    TokenContractService,
    LiquidityEventProcessorService,
    BlockchainCacheService,
  ],
  exports: [
    ContractService,
    AccountContractService,
    AccountFactoryContractService,
    LiquidityPoolContractService,
    TokenContractService,
    LiquidityEventProcessorService,
    BlockchainCacheService,
  ],
})
export class ContractModule {}
