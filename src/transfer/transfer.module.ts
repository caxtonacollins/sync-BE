import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContractModule } from '../contract/contract.module';
import { TransactionModule } from '../transaction/transaction.module';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({
  imports: [PrismaModule, ContractModule, TransactionModule],
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransferModule {}
