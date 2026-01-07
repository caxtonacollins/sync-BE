import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { LiquidityPoolContractService } from 'src/contract/services/liquidity-pool/liquidity-pool.service';
import { CreateAccountDto, TransferOwnershipDto, UpgradeAccountFactoryDto, SetLiquidityContractAddressDto, CreateSwapDto, ExecuteSwapDto } from 'src/types';

@UseInterceptors(CacheInterceptor)
@Controller('liquidity')
export class LiquidityController {
  constructor(private readonly contractService: LiquidityPoolContractService) {}

  @Post('register-user-to-liquidity')
  async registerUserToLiquidity(
    @Body() registerUserToLiquidityDto: CreateAccountDto,
  ) {
    return await this.contractService.registerUserToLiquidity(
      registerUserToLiquidityDto.userContractAddress,
      registerUserToLiquidityDto.userId,
    );
  }

  @Post('is-user-registered')
  async isUserRegistered(@Body() isUserRegisteredDto: CreateAccountDto) {
    return await this.contractService.isUserRegistered(
      isUserRegisteredDto.userContractAddress,
    );
  }

  @Post('add-supported-token')
  async addSupportedToken(
    @Body() addSupportedTokenDto: {
      tokenAddress: string;
      symbol: string;
      feedId?: string;
      decimals?: number;
      minAmount?: string;
      maxAmount?: string;
      isActive?: boolean;
    },
  ) {
    return await this.contractService.addSupportedToken(
      addSupportedTokenDto.tokenAddress,
      addSupportedTokenDto.symbol,
      addSupportedTokenDto.feedId,
      addSupportedTokenDto.decimals,
      addSupportedTokenDto.minAmount,
      addSupportedTokenDto.maxAmount,
      addSupportedTokenDto.isActive,
    );
  }

  @Post('add-token-to-liquidity')
  async addTokenToLiquidity(
    @Body() addTokenToLiquidityDto: { symbol: string; amount: string },
  ) {
    return await this.contractService.addTokenToLiquidity(
      addTokenToLiquidityDto.symbol,
      addTokenToLiquidityDto.amount,
    );
  }

  @Post('transfer-ownership')
  async transferLiquidityOwnership(
    @Body() transferOwnershipDto: TransferOwnershipDto,
  ): Promise<{
    transactionHash: string;
    receipt: any;
  }> {
    return await this.contractService.transferLiquidityOwnership(
      transferOwnershipDto.newOwnerAddress,
    );
  }

  @Post('upgrade-liquidity-contract')
  async upgradeLiquidityContract(
    @Body() upgradeAccountFactoryDto: UpgradeAccountFactoryDto,
  ) {
    return this.contractService.upgradeLiquidityContract(
      upgradeAccountFactoryDto.classHash,
    );
  }

  @Post('swap')
  async createSwap(@Body() createSwapDto: CreateSwapDto) {
    return this.contractService.createSwap(
      createSwapDto.fromToken,
      createSwapDto.toToken,
      createSwapDto.fromAmount,
      createSwapDto.minToAmount,
      createSwapDto.deadline,
    );
  }

  @Post('swap/execute')
  async executeSwap(@Body() executeSwapDto: ExecuteSwapDto) {
    return this.contractService.executeSwap(executeSwapDto.swapId);
  }

  @Post('upgrade-pragma-oracle-address')
  async upgradePragmaOracleAddress(
    @Body() upgradePragmaOracleAddressDto: { contractAddress: string },
  ) {
    return await this.contractService.upgradePragmaOracleAddress(
      upgradePragmaOracleAddressDto.contractAddress,
    );
  }

  @Get('amount_in_usd')
  async getAmountInUsd(@Query('address') address: string) {
    return await this.contractService.getTokenAmountInUsd(address);
  }

  @Post('set-liquidity-contract-address')
  async setLiquidityContractAddress(
    @Body() setLiquidityContractAddressDto: SetLiquidityContractAddressDto,
  ) {
    return await this.contractService.setLiquidityContractAddress(
      setLiquidityContractAddressDto.address,
    );
  }
}
