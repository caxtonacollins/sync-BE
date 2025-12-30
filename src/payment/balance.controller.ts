import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { BalanceService } from './balance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

class TransferDto {
  fromAccountNumber: string;
  toAccountNumber: string;
  amount: number;
  tokenSymbol: string;
}

@Controller('virtual-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Virtual Accounts')
@ApiBearerAuth()
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':accountNumber/balance')
  async getBalance(@Param('accountNumber') accountNumber: string) {
    return this.balanceService.getBalance(accountNumber);
  }


  @Post('transfer')
  async transferBetweenAccounts(@Body() transferDto: TransferDto) {
    const { fromAccountNumber, toAccountNumber, amount, tokenSymbol } = transferDto;

    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    return this.balanceService.transferBetweenAccounts(
      fromAccountNumber,
      toAccountNumber,
      amount,
      tokenSymbol
    );
  }
}
