import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ContractService } from './contract.service';

class CreateAccountDto {
  user_unique_id: string;
}

class SetLiquidityContractAddressDto {
  address: string;
}

class SetAccountClassHashDto {
  classHash: string;
}

class UpgradeAccountFactoryDto extends SetAccountClassHashDto { }

@Controller('contract')
export class ContractController {
  constructor(private readonly contractService: ContractService) { }

  @Post('create-account')
  createAccount(@Body() createAccountDto: CreateAccountDto) {
    return this.contractService.createAccount(createAccountDto.user_unique_id);
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

  @Get('balance/:symbol')
  getAccountBalance(@Param('symbol') symbol: string) {
    return this.contractService.getAccountBalance(symbol);
  }

  @Get('account_classhash')
  getAccountClassHash() {
    return this.contractService.getAccountClassHash();
  }

  @Post('account_classhash')
  setAccountClassHash(@Body() setAccountClassHashDto: SetAccountClassHashDto) {
    return this.contractService.setAccountClassHash(setAccountClassHashDto.classHash);
  }

  @Post('upgrade-account-factory')
  upgradeAccountFactory(@Body() upgradeAccountFactoryDto: UpgradeAccountFactoryDto) {
    return this.contractService.upgradeAccountFactory(
      upgradeAccountFactoryDto.classHash,
    );
  }
}
