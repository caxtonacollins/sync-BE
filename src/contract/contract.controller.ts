import { Body, Controller, Get, Param, Post, Query, UseInterceptors } from '@nestjs/common';
import { ContractService } from './contract.service';
import { LiquidityEventProcessorService } from './liquidity-event-processor.service';
import { CreateAccountDto, SetLiquidityContractAddressDto, SetAccountClassHashDto, UpgradeAccountFactoryDto, TransferOwnershipDto, SwapFiatToTokenDto, SwapTokenToFiatDto, MintTokenDto } from './dto';
import { CacheInterceptor } from '@nestjs/cache-manager';

@UseInterceptors(CacheInterceptor)
@Controller('contract')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly liquidityEventProcessorService: LiquidityEventProcessorService,
  ) {}

  @Post('events')
  async handleContractEvent(@Body() eventPayload: any) {
    return await this.liquidityEventProcessorService.process(eventPayload);
  }

  @Post('create-account')
  async createAccount(@Body() createAccountDto: CreateAccountDto) {
    return await this.contractService.createAccount(createAccountDto.fiatAccountId);
  }

  @Post('set-liquidity-contract-address')
  async setLiquidityContractAddress(
    @Body() setLiquidityContractAddressDto: SetLiquidityContractAddressDto,
  ) {
    return await this.contractService.setLiquidityContractAddress(
      setLiquidityContractAddressDto.address,
    );
  }

  @Get('dashboard/:userAddress')
  async getUserDashboardData(@Param('userAddress') userAddress: string) {
    return await this.contractService.getUserDashboardData(userAddress);
  }

  @Get('balance/:userAddress/:symbol')
  async getAccountBalance(
    @Param('userAddress') userAddress: string,
    @Param('symbol') symbol: string,
  ) {
    return await this.contractService.getAccountBalance(symbol, userAddress);
  }

  @Get('amount_in_usd')
  async getAmountInUsd(
    @Query('address') address: string,
  ) {
    return await this.contractService.getTokenAmountInUsd(address);
  }

  @Get('account_classhash')
  async getAccountClassHash() {
    return await this.contractService.getAccountClassHash();
  }

  @Post('account_classhash')
  async setAccountClassHash(@Body() setAccountClassHashDto: SetAccountClassHashDto) {
    return await this.contractService.setAccountClassHash(
      setAccountClassHashDto.classHash,
    );
  }

  @Post('upgrade-account-factory')
  async upgradeAccountFactory(
    @Body() upgradeAccountFactoryDto: UpgradeAccountFactoryDto,
  ) {
    return await this.contractService.upgradeAccountFactory(
      upgradeAccountFactoryDto.classHash,
    );
  }

  @Post('transfer-ownership')
  async transferFactoryOwnership(@Body() transferOwnershipDto: TransferOwnershipDto) {
    return await this.contractService.transferFactoryOwnership(
      transferOwnershipDto.newOwnerAddress,
    );
  }

  // Liquidity Endpoints
  @Post('liquidity/set-account-classhash')
  async setLiquidityAccountClassHash(
    @Body() setAccountClassHashDto: SetAccountClassHashDto,
  ) {
    return await this.contractService.setAccountClassHash(
      setAccountClassHashDto.classHash,
    );
  }

  @Post('register-user-to-liquidity')
  async registerUserToLiquidity(
    @Body() registerUserToLiquidityDto: CreateAccountDto,
  ) {
    return await this.contractService.registerUserToLiquidity(
      registerUserToLiquidityDto.userContractAddress,
      registerUserToLiquidityDto.fiatAccountId,
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
    @Body() addSupportedTokenDto: { symbol: string; address: string },
  ) {
    return await this.contractService.addSupportedToken(
      addSupportedTokenDto.symbol,
      addSupportedTokenDto.address,
    );
  }

  @Post('add-fiat-to-liquidity')
  async addFiatToLiquidity(@Body() addFiatToLiquidityDto: { symbol: string; amount: string }) {
    return await this.contractService.addFiatToLiquidity(
      addFiatToLiquidityDto.symbol,
      addFiatToLiquidityDto.amount,
    );
  }

  @Post('add-token-to-liquidity')
  async addTokenToLiquidity(@Body() addTokenToLiquidityDto: { symbol: string; amount: string }) {
    return await this.contractService.addTokenToLiquidity(
      addTokenToLiquidityDto.symbol,
      addTokenToLiquidityDto.amount,
    );
  }

  @Post('transfer-liquidity-ownership')
  async transferLiquidityOwnership(
    @Body() transferOwnershipDto: TransferOwnershipDto,
  ) {
    return await this.contractService.transferLiquidityOwnership(
      transferOwnershipDto.newOwnerAddress,
    );
  }

  @Post('swap-fiat-to-token')
  async swapFiatToToken(@Body() swapFiatToTokenDto: SwapFiatToTokenDto) {
    return await this.contractService.swapFiatToToken(
      swapFiatToTokenDto.userContractAddress,
      swapFiatToTokenDto.fiatSymbol,
      swapFiatToTokenDto.tokenSymbol,
      swapFiatToTokenDto.fiatAmount,
      swapFiatToTokenDto.swapOrderId,
    );
  }

  @Post('swap-token-to-fiat')
  async swapTokenToFiat(@Body() swapTokenToFiatDto: SwapTokenToFiatDto) {
    return await this.contractService.swapTokenToFiat(
      swapTokenToFiatDto.userContractAddress,
      swapTokenToFiatDto.fiatSymbol,
      swapTokenToFiatDto.tokenSymbol,
      swapTokenToFiatDto.tokenAmount,
      swapTokenToFiatDto.swapOrderId,
    );
  }

  @Post('upgrade-liquidity-contract')
  async upgradeLiquidityContract(
    @Body() upgradeAccountFactoryDto: UpgradeAccountFactoryDto,
  ) {
    return await this.contractService.upgradeLiquidityContract(
      upgradeAccountFactoryDto.classHash,
    );
  }

  @Post('upgrade-pragma-oracle-address')
  async upgradePragmaOracleAddress(
    @Body() upgradePragmaOracleAddressDto: { contractAddress: string },
  ) {
    return await this.contractService.upgradePragmaOracleAddress(
      upgradePragmaOracleAddressDto.contractAddress,
    );
  }

  @Post('mint-token')
  async mintToken(@Body() mintTokenDto: MintTokenDto) {
    return await this.contractService.mintToken(
      mintTokenDto.receiverAddress,
      mintTokenDto.amount,
    );
  }

}
