import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContractModule } from '../contract/contract.module';
import { TransactionModule } from '../transaction/transaction.module';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { WalletModule } from 'src/wallet/wallet.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ContractModule),
    TransactionModule,
    WalletModule,
    UserModule,
  ],
  controllers: [TransferController],
  providers: [TransferService, TransactionService],
})
export class TransferModule {}
