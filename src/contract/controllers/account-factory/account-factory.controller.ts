import { Body, Controller, Get, Post } from '@nestjs/common';
import { UpgradeAccountFactoryDto, TransferOwnershipDto, SetAccountClassHashDto } from 'src/contract/controllers/dto';
import { AccountFactoryContractService } from 'src/contract/services/account-factory/account-factory.service';

@Controller('account-factory')
export class AccountFactoryController {
    constructor(private readonly contractService: AccountFactoryContractService) { }

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

    @Post('account_classhash')
    async setAccountClassHash(@Body() setAccountClassHashDto: SetAccountClassHashDto) {
        return await this.contractService.setAccountClassHash(
            setAccountClassHashDto.classHash,
        );
    }

    @Post('liquidity/set-account-classhash')
    async setLiquidityAccountClassHash(
        @Body() setAccountClassHashDto: SetAccountClassHashDto,
    ) {
        return await this.contractService.setAccountClassHash(
            setAccountClassHashDto.classHash,
        );
    }

    @Get('account_classhash')
    async getAccountClassHash() {
        return await this.contractService.getAccountClassHash();
    }


}
