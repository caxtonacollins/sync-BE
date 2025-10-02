import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ContractService } from './contract.service';
import { EventListenerClientService } from './event-listener-client.service';
import { ContractEventHandlerService } from './contract-event-handler.service';

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
  constructor(
    private readonly contractService: ContractService,
    private readonly eventListenerClient: EventListenerClientService,
    private readonly eventHandlerService: ContractEventHandlerService,
  ) {}

  @Post('events')
  handleContractEvent(@Body() eventPayload: any) {
    this.eventHandlerService.handleEvent(eventPayload);
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
    @Query('amount') amount: string,
  ) {
    return this.contractService.getTokenAmountInUsd(address, amount);
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
  registerUserToLiquidity(@Body() registerUserToLiquidityDto: CreateAccountDto) {
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

  // Event Listener Endpoints
  @Get('event-listener/status')
  async getEventListenerStatus() {
    return await this.eventHandlerService.getListenerStatus();
  }

  @Post('event-listener/subscribe-transaction/:transactionHash')
  async subscribeToTransaction(@Param('transactionHash') transactionHash: string) {
    await this.eventHandlerService.subscribeToTransaction(transactionHash);
    return {
      message: `Subscribed to transaction ${transactionHash}`,
      transactionHash,
    };
  }

  @Get('event-listener/subscriptions')
  async getActiveSubscriptions() {
    const status = await this.eventListenerClient.getStatus();
    return {
      isConnected: status?.isConnected || false,
      activeSubscriptions: status?.activeSubscriptions || 0,
      subscriptionIds: status?.subscriptions?.map(s => s.id) || [],
    };
  }

  @Post('event-listener/unsubscribe/:subscriptionId')
  async unsubscribeFromEvent(@Param('subscriptionId') subscriptionId: string) {
    const result = await this.eventListenerClient.unsubscribe(subscriptionId);
    return {
      success: result.success,
      message: result.message,
      subscriptionId,
    };
  }

  @Post('event-listener/unsubscribe-all')
  async unsubscribeFromAllEvents() {
    const result = await this.eventListenerClient.unsubscribeAll();
    return {
      success: result.success,
      message: result.message,
    };
  }
}

