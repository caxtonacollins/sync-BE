import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CreateFiatStakeDto, UnstakeFiatDto, ClaimFiatRewardsDto } from './dto';
import { FiatStakingService } from './fiat-staking.service';
import { RequestWithUser } from 'src/user/user.controller';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('fiat-staking')
@UseGuards(JwtAuthGuard)
export class FiatStakingController {
  constructor(private readonly fiatStakingService: FiatStakingService) {}

  @Post('stake')
  async stake(@Req() req: RequestWithUser, @Body() dto: CreateFiatStakeDto) {
    return this.fiatStakingService.stakeFiat(req.user.userId, dto);
  }

  @Post('unstake')
  async unstake(@Req() req: RequestWithUser, @Body() dto: UnstakeFiatDto) {
    return this.fiatStakingService.unstakeFiat(req.user.userId, dto);
  }

  @Post('emergency-unstake')
  async emergencyUnstake(
    @Req() req: RequestWithUser,
    @Body() dto: UnstakeFiatDto,
  ) {
    return this.fiatStakingService.emergencyUnstakeFiat(req.user.userId, dto);
  }

  @Post('claim-rewards')
  async claimRewards(
    @Req() req: RequestWithUser,
    @Body() dto: ClaimFiatRewardsDto,
  ) {
    return this.fiatStakingService.claimRewards(req.user.userId, dto);
  }

  @Get('stakes')
  async getStakes(@Req() req: RequestWithUser) {
    return this.fiatStakingService.getUserStakes(req.user.userId);
  }

  @Get('stakes/:currency')
  async getStakesByCurrency(
    @Req() req: RequestWithUser,
    @Param('currency') currency: string,
  ) {
    return this.fiatStakingService.getUserStakes(req.user.userId, currency);
  }

  @Get('pools')
  async getPools() {
    return this.fiatStakingService.getAvailablePools();
  }

  @Get('pools/:currency')
  async getPoolByCurrency(@Param('currency') currency: string) {
    return this.fiatStakingService.getPoolByCurrency(currency);
  }

  @Get('pools/:currency/statistics')
  async getPoolStatistics(@Param('currency') currency: string) {
    return this.fiatStakingService.getPoolStatistics(currency);
  }

  @Post('calculate-rewards')
  calculateProjectedRewards(
    @Body() dto: { amount: number; apyBps: number; lockDays: number },
  ) {
    return this.fiatStakingService.calculateProjectedRewards(
      dto.amount,
      dto.apyBps,
      dto.lockDays,
    );
  }

  @Get('stakes/:stakeId/rewards')
  async getStakeRewards(
    @Req() req: RequestWithUser,
    @Param('stakeId') stakeId: string,
  ) {
    return this.fiatStakingService.calculateRewardsByStakePosition(
      req.user.userId,
      stakeId,
    );
  }
}
