import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MonnifyService } from '../monnify/monnify.service';
import { ContractService } from 'src/contract/contract.service';

@Module({
  imports: [PrismaModule],
  controllers: [WalletController],
  providers: [WalletService, MonnifyService, ContractService],
  exports: [WalletService],
})
export class WalletModule {}
