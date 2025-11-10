import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { CreateFiatStakeDto, UnstakeFiatDto, ClaimFiatRewardsDto } from './dto';
import { FiatStakingService } from './fiat-staking.service';
import { RequestWithUser } from 'src/user/user.controller';

@Controller('fiat-staking')
export class FiatStakingController {
    constructor(private readonly fiatStakingService: FiatStakingService) { }

    @Post('stake')
    async stake(@Req() req: RequestWithUser, @Body() dto: CreateFiatStakeDto) {
        return this.fiatStakingService.stakeFiat(req.user.userId, dto);
    }

    @Post('unstake')
    async unstake(@Req() req: RequestWithUser, @Body() dto: UnstakeFiatDto) {
        return this.fiatStakingService.unstakeFiat(req.user.userId, dto);
    }

    @Post('claim-rewards')
    async claimRewards(@Req() req: RequestWithUser, @Body() dto: ClaimFiatRewardsDto) {
        return this.fiatStakingService.claimRewards(req.user.userId, dto);
    }

    @Get('stakes')
    async getStakes(@Req() req: RequestWithUser) {
        return this.fiatStakingService.getUserStakes(req.user.userId);
    }

    @Get('stakes/:currency')
    async getStakesByCurrency(@Req() req: RequestWithUser, @Param('currency') currency: string) {
        return this.fiatStakingService.getUserStakes(req.user.userId, currency);
    }

    @Get('pools')
    async getPools() {
        // Return available staking pools
        return this.fiatStakingService.getAvailablePools();
    }

    @Get('calculate-rewards')
    async calculateRewards(
        @Body() dto: { amount: number; apyBps: number; lockDays: number },
    ) {
        return this.fiatStakingService.calculateProjectedRewards(
            dto.amount,
            dto.apyBps,
            dto.lockDays,
        );
    }
}
