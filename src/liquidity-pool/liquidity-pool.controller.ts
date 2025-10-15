import { Controller, Get, Param } from '@nestjs/common';
import { LiquidityPoolService } from './liquidity-pool.service';

@Controller('liquidity-pool')
export class LiquidityPoolController {
  constructor(private readonly liquidityPoolService: LiquidityPoolService) {}

  @Get()
  findAllPools() {
    return this.liquidityPoolService.findAllPools();
  }

  @Get(':symbol')
  findPoolBySymbol(@Param('symbol') symbol: string) {
    return this.liquidityPoolService.findPoolBySymbol(symbol);
  }

  @Get(':symbol/history')
  findPoolHistory(@Param('symbol') symbol: string) {
    return this.liquidityPoolService.findPoolHistory(symbol);
  }
}
