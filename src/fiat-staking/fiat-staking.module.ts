import { Module } from '@nestjs/common';
import { ContractModule } from 'src/contract/contract.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { MonnifyModule } from 'src/monnify/monnify.module';
import { SharedModule } from 'src/shared/shared.module';
import { FiatStakingService } from './fiat-staking.service';

@Module({
  imports: [
    PrismaModule,
    ContractModule,
    WalletModule,
    MonnifyModule,
    SharedModule,
  ],
  providers: [FiatStakingService],
  exports: [FiatStakingService],
})
export class FiatStakingModule {}
