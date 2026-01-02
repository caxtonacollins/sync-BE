import { Module, forwardRef } from '@nestjs/common';
import { SwapOrderService } from './swap-order.service';
import { SwapOrderController } from './swap-order.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../transaction/wallet/wallet.module';
import { ContractModule } from '../contract/contract.module';
import { UserModule } from '../user/user.module';
import { MonnifyModule } from 'src/payment/monnify/monnify.module';
import { PaymentModule } from 'src/payment/payment.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    forwardRef(() => ContractModule),
    forwardRef(() => UserModule),
    MonnifyModule,
    PaymentModule,
    SharedModule,
  ],
  controllers: [SwapOrderController],
  providers: [
    SwapOrderService,
    {
      provide: 'SwapOrderService',
      useExisting: SwapOrderService,
    },
  ],
  exports: [SwapOrderService],
})
export class SwapOrderModule {}
