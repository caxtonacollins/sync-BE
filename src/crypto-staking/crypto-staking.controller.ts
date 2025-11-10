

// ============================================================================
// CONTROLLER
// ============================================================================

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
import { User } from '@prisma/client';
import { CryptoStakingService } from './crypto-staking.service';
import { CreateCryptoStakeDto } from './dto';
import { UnstakeCryptoDto } from './dto';
import { ClaimCryptoRewardsDto } from './dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RequestWithUser } from 'src/user/user.controller';

@Controller('crypto-staking')
@UseGuards(JwtAuthGuard)
export class CryptoStakingController {
    constructor(private readonly cryptoStakingService: CryptoStakingService) { }

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
    async emergencyUnstake(@Req() req: RequestWithUser, @Body() dto: UnstakeCryptoDto) {
        return this.cryptoStakingService.emergencyUnstake(req.user.userId, dto);
    }

    @Get('stakes')
    async getStakes(@Req() req: RequestWithUser) {
        return this.cryptoStakingService.getUserStakes(req.user.userId);
    }

    @Get('stakes/:tokenSymbol')
    async getStakesByToken(
        @Req() req: RequestWithUser,
        @Param('tokenSymbol') tokenSymbol: string,
    ) {
        return this.cryptoStakingService.getUserStakes(req.user.userId, tokenSymbol);
    }

    @Get('pools')
    async getPools() {
        return this.cryptoStakingService.getAllPools();
    }
}
