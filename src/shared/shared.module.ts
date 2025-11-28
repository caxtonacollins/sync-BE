import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { BalanceSyncService } from './services/balance-sync.service';
import { CacheSyncService } from './services/cache-sync.service';
import { ContractModule } from 'src/contract/contract.module';

@Module({
  imports: [forwardRef(() => ContractModule)],
  providers: [BalanceSyncService, CacheSyncService, PrismaService],
  exports: [BalanceSyncService, CacheSyncService],
})
export class SharedModule {}
