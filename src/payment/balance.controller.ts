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

  @Get(':accountNumber/transactions')
  async getTransactionHistory(
    @Param('accountNumber') accountNumber: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.balanceService.getTransactionHistory(accountNumber, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      type,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('transfer')
  async transferBetweenAccounts(@Body() transferDto: TransferDto) {
    const { fromAccountNumber, toAccountNumber, amount } = transferDto;

    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    return this.balanceService.transferBetweenAccounts(
      fromAccountNumber,
      toAccountNumber,
      amount,
    );
  }

  @Post(':accountNumber/reconcile')
  async reconcileAccount(@Param('accountNumber') accountNumber: string) {
    await this.balanceService.reconcileWithFlutterwave(accountNumber);
    return { message: 'Account reconciled successfully' };
  }
}
