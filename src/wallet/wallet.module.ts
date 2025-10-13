import { Module, forwardRef } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { KeyManagementService } from './key-management.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MonnifyService } from '../monnify/monnify.service';
import { ContractModule } from '../contract/contract.module';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [PrismaModule, forwardRef(() => ContractModule)],
  controllers: [WalletController],
  providers: [WalletService, KeyManagementService, MonnifyService, PrismaService],
  exports: [WalletService, KeyManagementService],
})
export class WalletModule {}
