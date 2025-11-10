import { Module } from '@nestjs/common';
import { CryptoStakingService } from './crypto-staking.service';
import { CryptoStakingController } from './crypto-staking.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { ContractModule } from 'src/contract/contract.module';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [
    ContractModule,
    WalletModule
  ],
  providers: [
    CryptoStakingService, 
    PrismaService
  ],
  controllers: [CryptoStakingController]
})
export class CryptoStakingModule {}
