import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LiquidityPoolController } from './liquidity-pool.controller';
import { LiquidityPoolService } from './liquidity-pool.service';

@Module({
  imports: [PrismaModule],
  controllers: [LiquidityPoolController],
  providers: [LiquidityPoolService],
})
export class LiquidityPoolModule {}
