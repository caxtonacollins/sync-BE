import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ContractService } from './contract.service';
import { LiquidityEventProcessorService } from './liquidity-event-processor.service';

// --- DTOs ---
class CreateAccountDto {
  fiatAccountId: string;
  userContractAddress: string;
}

class SetLiquidityContractAddressDto {
  address: string;
}

class SetAccountClassHashDto {
  classHash: string;
}

class UpgradeAccountFactoryDto extends SetAccountClassHashDto { }

class TransferOwnershipDto {
  newOwnerAddress: string;
}

class SwapFiatToTokenDto {
  userContractAddress: string;
  fiatSymbol: string;
  tokenSymbol: string;
  fiatAmount: number;
  swapOrderId: string;
}

class SwapTokenToFiatDto {
  userContractAddress: string;
  fiatSymbol: string;
  tokenSymbol: string;
  tokenAmount: string;
  swapOrderId: string;
}

class MintTokenDto {
  receiverAddress: string;
  amount: string;
}

@Controller('contract')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly liquidityEventProcessorService: LiquidityEventProcessorService,
  ) { }

  @Post('events')
  async handleContractEvent(@Body() eventPayload: any) {
    await this.liquidityEventProcessorService.process(eventPayload);
    return { status: 'event received' };
  }

  @Post('create-account')
  createAccount(@Body() createAccountDto: CreateAccountDto) {
    return this.contractService.createAccount(createAccountDto.fiatAccountId);
  }

  @Post('set-liquidity-contract-address')
  setLiquidityContractAddress(
    @Body() setLiquidityContractAddressDto: SetLiquidityContractAddressDto,
  ) {
    this.contractService.setLiquidityContractAddress(
      setLiquidityContractAddressDto.address,
    );
  }

  @Get('dashboard/:userAddress')
  getUserDashboardData(@Param('userAddress') userAddress: string) {
    return this.contractService.getUserDashboardData(userAddress);
  }

  @Get('balance/:userAddress/:symbol')
  getAccountBalance(
    @Param('userAddress') userAddress: string,
    @Param('symbol') symbol: string,
  ) {
    return this.contractService.getAccountBalance(symbol, userAddress);
  }

  @Get('amount_in_usd')
  getAmountInUsd(
    @Query('address') address: string,
  ) {
    return this.contractService.getTokenAmountInUsd(address);
  }

  @Get('account_classhash')
  getAccountClassHash() {
    return this.contractService.getAccountClassHash();
  }

  @Post('account_classhash')
  setAccountClassHash(@Body() setAccountClassHashDto: SetAccountClassHashDto) {
    return this.contractService.setAccountClassHash(
      setAccountClassHashDto.classHash,
    );
  }

  @Post('upgrade-account-factory')
  upgradeAccountFactory(
    @Body() upgradeAccountFactoryDto: UpgradeAccountFactoryDto,
  ) {
    return this.contractService.upgradeAccountFactory(
      upgradeAccountFactoryDto.classHash,
    );
  }

  @Post('transfer-ownership')
  transferFactoryOwnership(@Body() transferOwnershipDto: TransferOwnershipDto) {
    return this.contractService.transferFactoryOwnership(
      transferOwnershipDto.newOwnerAddress,
    );
  }

  // Liquidity Endpoints
  @Post('liquidity/set-account-classhash')
  setLiquidityAccountClassHash(
    @Body() setAccountClassHashDto: SetAccountClassHashDto,
  ) {
    return this.contractService.setAccountClassHash(
      setAccountClassHashDto.classHash,
    );
  }

  @Post('register-user-to-liquidity')
  registerUserToLiquidity(
    @Body() registerUserToLiquidityDto: CreateAccountDto,
  ) {
    return this.contractService.registerUserToLiquidity(
      registerUserToLiquidityDto.userContractAddress,
      registerUserToLiquidityDto.fiatAccountId,
    );
  }

  @Post('is-user-registered')
  isUserRegistered(@Body() isUserRegisteredDto: CreateAccountDto) {
    return this.contractService.isUserRegistered(
      isUserRegisteredDto.userContractAddress,
    );
  }

  @Post('add-supported-token')
  addSupportedToken(
    @Body() addSupportedTokenDto: { symbol: string; address: string },
  ) {
    return this.contractService.addSupportedToken(
      addSupportedTokenDto.symbol,
      addSupportedTokenDto.address,
    );
  }

  @Post('add-fiat-to-liquidity')
  addFiatToLiquidity(@Body() addFiatToLiquidityDto: { symbol: string; amount: string }) {
    return this.contractService.addFiatToLiquidity(
      addFiatToLiquidityDto.symbol,
      addFiatToLiquidityDto.amount,
    );
  }

  @Post('add-token-to-liquidity')
  addTokenToLiquidity(@Body() addTokenToLiquidityDto: { symbol: string; amount: string }) {
    return this.contractService.addTokenToLiquidity(
      addTokenToLiquidityDto.symbol,
      addTokenToLiquidityDto.amount,
    );
  }

  @Post('transfer-liquidity-ownership')
  transferLiquidityOwnership(
    @Body() transferOwnershipDto: TransferOwnershipDto,
  ) {
    return this.contractService.transferLiquidityOwnership(
      transferOwnershipDto.newOwnerAddress,
    );
  }

  @Post('swap-fiat-to-token')
  swapFiatToToken(@Body() swapFiatToTokenDto: SwapFiatToTokenDto) {
    return this.contractService.swapFiatToToken(
      swapFiatToTokenDto.userContractAddress,
      swapFiatToTokenDto.fiatSymbol,
      swapFiatToTokenDto.tokenSymbol,
      swapFiatToTokenDto.fiatAmount,
      swapFiatToTokenDto.swapOrderId,
    );
  }

  @Post('swap-token-to-fiat')
  swapTokenToFiat(@Body() swapTokenToFiatDto: SwapTokenToFiatDto) {
    return this.contractService.swapTokenToFiat(
      swapTokenToFiatDto.userContractAddress,
      swapTokenToFiatDto.fiatSymbol,
      swapTokenToFiatDto.tokenSymbol,
      swapTokenToFiatDto.tokenAmount,
      swapTokenToFiatDto.swapOrderId,
    );
  }

  @Post('upgrade-liquidity-contract')
  upgradeLiquidityContract(
    @Body() upgradeAccountFactoryDto: UpgradeAccountFactoryDto,
  ) {
    return this.contractService.upgradeLiquidityContract(
      upgradeAccountFactoryDto.classHash,
    );
  }

  @Post('upgrade-pragma-oracle-address')
  upgradePragmaOracleAddress(
    @Body() upgradePragmaOracleAddressDto: { contractAddress: string },
  ) {
    return this.contractService.upgradePragmaOracleAddress(
      upgradePragmaOracleAddressDto.contractAddress,
    );
  }

  @Post('mint-token')
  mintToken(@Body() mintTokenDto: MintTokenDto) {
    return this.contractService.mintToken(
      mintTokenDto.receiverAddress,
      mintTokenDto.amount,
    );
  }

}
