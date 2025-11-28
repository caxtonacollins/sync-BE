import { Module } from '@nestjs/common';
import { ContractModule } from 'src/contract/contract.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { MonnifyModule } from 'src/monnify/monnify.module';
import { FiatStakingService } from './fiat-staking.service';

@Module({
  imports: [PrismaModule, ContractModule, WalletModule, MonnifyModule],
  providers: [FiatStakingService],
  exports: [FiatStakingService],
})
export class FiatStakingModule {}
