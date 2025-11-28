import { Module } from '@nestjs/common';
import { BalanceSyncController } from './balance-sync.controller';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [BalanceSyncController],
})
export class BalanceSyncModule {}
