import { Module } from '@nestjs/common';
import { CryptoStakingService } from './crypto-staking.service';
import { CryptoStakingController } from './crypto-staking.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { ContractModule } from 'src/contract/contract.module';
import { WalletModule } from 'src/transaction/wallet/wallet.module';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  imports: [ContractModule, WalletModule, SharedModule],
  providers: [CryptoStakingService, PrismaService],
  controllers: [CryptoStakingController],
  exports: [CryptoStakingService],
})
export class CryptoStakingModule {}
