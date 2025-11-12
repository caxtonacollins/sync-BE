import { Body, Controller, Get, Param, Post, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { AccountContractService } from 'src/contract/services/account/account.service';
import { CreateAccountDto } from 'src/contract/controllers/dto';

@UseInterceptors(CacheInterceptor)
@Controller('account')
export class AccountController {
    constructor(private readonly accountService: AccountContractService) {

    }
    @Post('create-account')
    async createAccount(@Body() createAccountDto: CreateAccountDto) {
        return await this.accountService.createAccount(createAccountDto.fiatAccountId);
    }

    @Get('dashboard/:userAddress')
    async getUserDashboardData(@Param('userAddress') userAddress: string) {
        return await this.accountService.getUserDashboardData(userAddress);
    }
}
