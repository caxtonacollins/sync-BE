import {
  Controller,
  Get,
  UseGuards,
  Req,
  Param,
  Post,
  Body,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RequestWithUser } from 'src/user/user.controller';
import { StakingService } from './staking.service';

@Controller('staking')
@UseGuards(JwtAuthGuard)
export class StakingController {
  constructor(private readonly stakingService: StakingService) {}

  @Get('summary')
  async getStakingSummary(@Req() req: RequestWithUser) {
    return this.stakingService.getStakingSummary(req.user.userId);
  }

  @Get('stakes')
  async getAllUserStakes(@Req() req: RequestWithUser) {
    return this.stakingService.getAllUserStakes(req.user.userId);
  }

  @Get('pools')
  async getAllPools() {
    return this.stakingService.getAllPools();
  }

  @Get('pools/:symbol')
  async getPoolBySymbol(@Param('symbol') symbol: string) {
    return this.stakingService.getPoolBySymbol(symbol);
  }

  @Get('pools/:symbol/statistics')
  async getPoolStatistics(@Param('symbol') symbol: string) {
    return this.stakingService.getPoolStatistics(symbol);
  }

  @Post('calculate-rewards')
  calculateProjectedRewards(
    @Body() dto: { amount: number; apyBps: number; lockDays: number },
  ) {
    return (this.stakingService as any).calculateProjectedRewards(
      dto.amount,
      dto.apyBps,
      dto.lockDays,
    );
  }

  @Get('stakes/:stakeId/rewards')
  async getStakeRewards(
    @Req() req: RequestWithUser,
    @Param('stakeId') stakeId: string,
    @Query('type') type?: 'CRYPTO' | 'FIAT',
  ) {
    return this.stakingService.calculateRewardsByStakePosition(
      req.user.userId,
      stakeId,
      type,
    );
  }
}
