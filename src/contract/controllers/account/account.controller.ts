import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { AccountContractService } from 'src/contract/services/account/account.service';
import { CreateAccountDto, SetAccountClassHashDto, TransferOwnershipDto, UpgradeAccountFactoryDto } from 'src/types';

@UseInterceptors(CacheInterceptor)
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountContractService) {}
  @Post('create-account')
  async createAccount(@Body() createAccountDto: CreateAccountDto): Promise<{ 
    transactionHash: string;
    accountAddress?: string;
    encryptedPrivateKey?: string;
    receipt?: any;
  }> {
    return await this.accountService.createAccount(
      createAccountDto.userId,
    );
  }
  
  // Account Factory
  @Post('upgrade-account-factory')
  async upgradeAccountFactory(
    @Body() upgradeAccountFactoryDto: UpgradeAccountFactoryDto,
  ): Promise<{ 
    transactionHash: string;
    receipt: any;
  }> {
    return await this.accountService.upgradeAccountFactory(
      upgradeAccountFactoryDto.classHash,
    );
  }

  @Post('transfer-ownership')
  async transferFactoryOwnership(
    @Body() transferOwnershipDto: TransferOwnershipDto,
  ): Promise<{ 
    transactionHash: string;
    receipt: any;
  }> {
    return await this.accountService.transferFactoryOwnership(
      transferOwnershipDto.newOwnerAddress,
    );
  }

  @Post('account_classhash')
  async setAccountClassHash(
    @Body() setAccountClassHashDto: SetAccountClassHashDto,
  ): Promise<{ 
    transactionHash: string;
    receipt: any;
  }> {
    return await this.accountService.setAccountClassHash(
      setAccountClassHashDto.classHash,
    );
  }

  @Post('liquidity/set-account-classhash')
  async setLiquidityAccountClassHash(
    @Body() setAccountClassHashDto: SetAccountClassHashDto,
  ) {
    return await this.accountService.setAccountClassHash(
      setAccountClassHashDto.classHash,
    );
  }

  @Get('account_classhash')
  async getAccountClassHash() {
    return await this.accountService.getAccountClassHash();
  }
}
