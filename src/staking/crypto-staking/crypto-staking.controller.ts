import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { CryptoStakingService } from './crypto-staking.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RequestWithUser } from 'src/user/user.controller';
import { ClaimCryptoRewardsDto, CreateCryptoStakeDto, UnstakeCryptoDto } from 'src/types/dto/crypto-staking/crypto-staking.dto';

@Controller('crypto-staking')
@UseGuards(JwtAuthGuard)
export class CryptoStakingController {
  constructor(private readonly cryptoStakingService: CryptoStakingService) {}

  @Post('stake')
  async stake(@Req() req: RequestWithUser, @Body() dto: CreateCryptoStakeDto) {
    return this.cryptoStakingService.stakeCrypto(req.user.userId, dto);
  }

  @Post('unstake')
  async unstake(@Req() req: RequestWithUser, @Body() dto: UnstakeCryptoDto) {
    return this.cryptoStakingService.unstakeCrypto(req.user.userId, dto);
  }

  @Post('claim-rewards')
  async claimRewards(
    @Req() req: RequestWithUser,
    @Body() dto: ClaimCryptoRewardsDto,
  ) {
    return this.cryptoStakingService.claimRewards(req.user.userId, dto);
  }

  @Delete('emergency-unstake')
  async emergencyUnstake(
    @Req() req: RequestWithUser,
    @Body() dto: UnstakeCryptoDto,
  ) {
    return this.cryptoStakingService.emergencyUnstake(req.user.userId, dto);
  }

  @Get('user-stakes')
  async getUserStakes(@Req() req: RequestWithUser) {
    return this.cryptoStakingService.getAllUserStakes(req.user.userId);
  }

  @Get('stakes/:tokenSymbol')
  async getStakesByToken(
    @Req() req: RequestWithUser,
    @Param('tokenSymbol') tokenSymbol: string,
  ) {
    return this.cryptoStakingService.getUserStakes(
      req.user.userId,
      tokenSymbol,
    );
  }

  @Get('pools')
  async getPools() {
    return this.cryptoStakingService.getAllPools();
  }

  @Get('pools/:tokenSymbol')
  async getPoolBySymbol(@Param('tokenSymbol') tokenSymbol: string) {
    return this.cryptoStakingService.getPoolBySymbol(tokenSymbol);
  }

  @Get('pools/:tokenSymbol/statistics')
  async getPoolStatistics(@Param('tokenSymbol') tokenSymbol: string) {
    return this.cryptoStakingService.getPoolStatistics(tokenSymbol);
  }

  @Post('calculate-rewards')
  calculateProjectedRewards(
    @Body() dto: { amount: number; apyBps: number; lockDays: number },
  ) {
    return (this.cryptoStakingService as any).calculateProjectedRewards(
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
    return this.cryptoStakingService.calculateRewardsByStakePosition(
      req.user.userId,
      stakeId,
    );
  }
}
