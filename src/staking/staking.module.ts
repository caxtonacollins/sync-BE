import { Module } from '@nestjs/common';
import { CryptoStakingModule } from 'src/staking/crypto-staking/crypto-staking.module';
import { FiatStakingModule } from 'src/staking/fiat-staking/fiat-staking.module';
import { ExchangeRateModule } from 'src/transaction/exchange-rate-and-pragma/exchange-rate.module';
import { StakingController } from './staking.controller';
import { StakingService } from './staking.service';

@Module({
  imports: [CryptoStakingModule, FiatStakingModule, ExchangeRateModule],
  controllers: [StakingController],
  providers: [StakingService],
})
export class StakingModule {}
