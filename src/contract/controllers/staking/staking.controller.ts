import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { StakingContractService } from 'src/contract/services/staking/staking.service';

@Controller('staking')
export class StakingController {
    constructor(private readonly stakingService: StakingContractService) { }

    @Post('create-staking-pool')
    createStakingPool(@Body() body: any) {
        return this.stakingService.createStakingPool(
            body.tokenSymbol,
            body.tokenAddress,
            body.baseApyBps,
            body.bonusApyBps,
            body.minStakeAmount,
            body.maxStakeAmount,
        );
    }

    @Post('record-fiat-stake')
    recordFiatStake(@Body() body: any) {
        return this.stakingService.recordFiatStake(
            body.userId,
            body.currency,
            body.amount,
            body.lockDuration,
            body.stakeId,
        );
    }

    @Post('record-fiat-unstake')
    recordFiatUnstake(@Body() body: any) {
        return this.stakingService.recordFiatUnstake(
            body.userId,
            body.currency,
            body.stakeId,
        );
    }

    @Post('record-fiat-reward-claim')
    recordFiatRewardClaim(@Body() body: any) {
        return this.stakingService.recordFiatRewardClaim(
            body.userId,
            body.currency,
            body.stakeId,
            body.rewards,
        );
    }

    @Post('update-pool-apy')
    updatePoolApy(@Body() body: any) {
        return this.stakingService.updatePoolApy(body.tokenSymbol, body.baseApyBps, body.bonusApyBps);
    }

    @Post('toggle-pool')
    togglePool(@Body() body: any) {
        return this.stakingService.togglePool(body.tokenSymbol);
    }

    @Post('pause')
    pause() {
        return this.stakingService.pause();
    }

    @Post('unpause')
    unpause() {
        return this.stakingService.unpause();
    }

    @Post('update-balance-merkle-root')
    updateBalanceMerkleRoot(@Body() body: any) {
        return this.stakingService.updateBalanceMerkleRoot(
            body.merkleRoot,
        );
    }

    @Post('create-reserve-snapshot')
    createReserveSnapshot(@Body() body: any) {
        return this.stakingService.createReserveSnapshot(
            body.currency,
            body.balance,
            body.signature,
            body.ipfsHash,
        );
    }

    @Post('upgrade')
    upgrade(@Body() body: any) {
        return this.stakingService.upgradeContract(body.classHash);
    }

    @Get('pool/:tokenSymbol')
    getPool(@Param('tokenSymbol') tokenSymbol: string) {
        return this.stakingService.getStakingPool(tokenSymbol);
    }

    @Get('user/:userAddress/stakes/:tokenSymbol')
    getUserStakes(@Param('userAddress') userAddress: string, @Param('tokenSymbol') tokenSymbol: string, @Param('stakeId') stakeId: number) {
        return this.stakingService.getStakePosition(userAddress, tokenSymbol, stakeId);
    }

    @Get('calculate-rewards/:userAddress/:tokenSymbol/:stakeId')
    calculateRewards(@Param('userAddress') userAddress: string, @Param('tokenSymbol') tokenSymbol: string, @Param('stakeId') stakeId: number) {
        return this.stakingService.calculateRewards(userAddress, tokenSymbol, stakeId);
    }

    @Get('pools')
    getAllPools() {
        return this.stakingService.getAllPools();
    }

    @Get('user/:userAddress/stake-count/:tokenSymbol')
    getUserStakeCount(@Param('userAddress') userAddress: string, @Param('tokenSymbol') tokenSymbol: string) {
        return this.stakingService.getUserStakeCount(userAddress, tokenSymbol);
    }

    @Get('version')
    getVersion() {
        return this.stakingService.getVersion();
    }

}
