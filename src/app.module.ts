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
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { TransferModule } from './transfer/transfer.module';
import { PaymentModule } from './payment/payment.module';
import { PaymentService } from './payment/payment.service';
import { WalletService } from './wallet/wallet.service';
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
    FlutterwaveModule,
    TransferModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
