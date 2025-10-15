import { Module, forwardRef } from '@nestjs/common';
import { SwapOrderService } from './swap-order.service';
import { SwapOrderController } from './swap-order.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionModule } from '../transaction/transaction.module';
import { ContractModule } from '../contract/contract.module';
import { UserModule } from '../user/user.module';
import { UserService } from 'src/user/user.service';
import { MonnifyService } from 'src/monnify/monnify.service';
import { MonnifyModule } from 'src/monnify/monnify.module';
import { PaymentModule } from 'src/payment/payment.module';
import { PaymentService } from 'src/payment/payment.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    TransactionModule,
    forwardRef(() => ContractModule),
    forwardRef(() => UserModule),
    MonnifyModule,
    PaymentModule,
  ],
  controllers: [SwapOrderController],
  providers: [
    SwapOrderService,
    UserService,
    MonnifyService,
    PaymentService,
    FlutterwaveService,
    {
      provide: 'SwapOrderService',
      useExisting: SwapOrderService,
    },
  ],
  exports: [SwapOrderService],
})
export class SwapOrderModule {}
