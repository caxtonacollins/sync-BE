import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { TransactionModule } from './transaction/transaction.module';
import { ContractModule } from './contract/contract.module';
import { WalletModule } from './wallet/wallet.module';
import { MonnifyModule } from './monnify/monnify.module';
import { SwapOrderModule } from './swap-order/swap-order.module';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import { LiquidityPoolModule } from './liquidity-pool/liquidity-pool.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { TransferModule } from './transfer/transfer.module';
import { PaymentModule } from './payment/payment.module';
import { SyncPayModule } from './syncpay/syncpay.module';
import { CacheModule } from './cache/cache.module';
import { FiatStakingModule } from './fiat-staking/fiat-staking.module';
import { StakingModule } from './staking/staking.module';
import { CryptoStakingModule } from './crypto-staking/crypto-staking.module';
import { BalanceSyncModule } from './balance-sync/balance-sync.module';

@Module({
  imports: [
    CacheModule,
    UserModule,
    PrismaModule,
    AuthModule,
    TransactionModule,
    ContractModule,
    WalletModule,
    MonnifyModule,
    SwapOrderModule,
    ExchangeRateModule,
    LiquidityPoolModule,
    FlutterwaveModule,
    TransferModule,
    PaymentModule,
    SyncPayModule,
    FiatStakingModule,
    StakingModule,
    CryptoStakingModule,
    BalanceSyncModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
