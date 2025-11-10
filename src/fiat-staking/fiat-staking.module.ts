import { Module } from '@nestjs/common';
import { ContractModule } from 'src/contract/contract.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { MonnifyModule } from 'src/monnify/monnify.module';

@Module({
  imports: [
    PrismaModule, 
    ContractModule, 
    WalletModule,
    MonnifyModule
  ]
})
export class FiatStakingModule {}
