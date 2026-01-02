import { Module } from '@nestjs/common';
import { SellService } from './sell.service';
import { SellController } from './sell.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentModule as BalanceModule } from 'src/payment/payment.module';
import { ContractModule } from 'src/contract/contract.module';
import { TransactionModule } from 'src/transaction/transaction.module';
import { WalletModule } from 'src/transaction/wallet/wallet.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => BalanceModule),
    forwardRef(() => ContractModule),
    forwardRef(() => TransactionModule),
    forwardRef(() => WalletModule),
    forwardRef(() => AuditLogModule),
  ],
  providers: [SellService],
  controllers: [SellController],
  exports: [SellService],
})
export class SellModule {}
