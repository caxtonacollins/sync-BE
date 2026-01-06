import { Module, forwardRef } from '@nestjs/common';
import { BuyService } from './buy.service';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { FlutterwaveModule } from 'src/payment/flutterwave/flutterwave.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TransactionModule } from 'src/transaction/transaction.module';
import { BuyController } from './buy.controller';
import { PaymentModule as BalanceModule } from 'src/payment/payment.module';
import { ContractModule } from 'src/contract/contract.module';
import { WalletModule } from 'src/transaction/wallet/wallet.module';

@Module({
  imports: [
    PrismaModule,
    TransactionModule,
    FlutterwaveModule,
    AuditLogModule,
    forwardRef(() => BalanceModule),
    ContractModule,
    WalletModule,
  ],
  controllers: [BuyController],
  providers: [BuyService],
  exports: [BuyService],
})
export class BuyModule {}
