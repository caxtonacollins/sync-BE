import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ContractService } from './contract.service';

class CreateAccountDto {
  userContractAddress: string;
  fiatAccountId: string;
}

class SetLiquidityContractAddressDto {
  address: string;
}

class SetAccountClassHashDto {
  classHash: string;
}

class UpgradeAccountFactoryDto extends SetAccountClassHashDto {}

class TransferOwnershipDto {
  newOwnerAddress: string;
}

class SwapFiatToTokenDto {
  userContractAddress: string;
  fiatSymbol: string;
  tokenSymbol: string;
  fiatAmount: number;
}

class SwapTokenToFiatDto {
  userContractAddress: string;
  fiatSymbol: string;
  tokenSymbol: string;
  tokenAmount: string;
}

class MintTokenDto {
  receiverAddress: string;
  amount: string;
}

@Controller('contract')
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Post('create-account')
  createAccount(@Body() createAccountDto: CreateAccountDto) {
    return this.contractService.createAccount(
      createAccountDto.userContractAddress,
    );
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
  registerUserToLiquidity(@Body() createAccountDto: CreateAccountDto) {
    return this.contractService.registerUserToLiquidity(
      createAccountDto.userContractAddress,
      createAccountDto.fiatAccountId,
    );
  }

  @Post('is-user-registered')
  isUserRegistered(@Body() createAccountDto: CreateAccountDto) {
    return this.contractService.isUserRegistered(
      createAccountDto.userContractAddress,
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
    );
  }

  @Post('swap-token-to-fiat')
  swapTokenToFiat(@Body() swapTokenToFiatDto: SwapTokenToFiatDto) {
    return this.contractService.swapTokenToFiat(
      swapTokenToFiatDto.userContractAddress,
      swapTokenToFiatDto.fiatSymbol,
      swapTokenToFiatDto.tokenSymbol,
      swapTokenToFiatDto.tokenAmount,
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
