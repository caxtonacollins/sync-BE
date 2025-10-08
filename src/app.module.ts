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
import { ContractService } from './contract/contract.service';
import { SwapOrderModule } from './swap-order/swap-order.module';
import { SwapOrderService } from './swap-order/swap-order.service';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import { LiquidityPoolModule } from './liquidity-pool/liquidity-pool.module';

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService, ContractService, SwapOrderService],
})
export class AppModule {}
