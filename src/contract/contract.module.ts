import { Module, forwardRef } from '@nestjs/common';
import { ContractController } from './contract.controller';
import { ContractService } from './contract.service';
import { LiquidityEventProcessorService } from './liquidity-event-processor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WalletModule } from '../wallet/wallet.module';
import { SwapOrderModule } from '../swap-order/swap-order.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    PrismaModule,
    WalletModule,
    forwardRef(() => UserModule),
    forwardRef(() => SwapOrderModule),
  ],
  controllers: [ContractController],
  providers: [ContractService, LiquidityEventProcessorService],
  exports: [ContractService, LiquidityEventProcessorService],
})
export class ContractModule {}
