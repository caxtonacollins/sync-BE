import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Patch,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TxFilterDto } from './dto/tx-filter.dto';
import { UpdateTxDto } from './dto/update-tx.dto';

@Controller('tx')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  // GET /transactions/user/abc123?
  // type=deposit&
  // status=completed&
  // currency=USD&
  // minAmount=100&
  // maxAmount=1000&
  // page=1&
  // limit=20&
  // includeFiatAccount=true&
  // includeCryptoWallet=false
  @Get('user/:id')
  async getTransactionsForUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TxFilterDto,
    @Query('includeFiatAccount') includeFiatAccount?: string,
    @Query('includeCryptoWallet') includeCryptoWallet?: string,
    @Query('includeSwapOrder') includeSwapOrder?: string,
  ) {
    const parseBoolean = (val?: string) => val === 'true';

    return this.transactionService.getTransactionsForUser(id, query, {
      fiatAccount: parseBoolean(includeFiatAccount),
      cryptoWallet: parseBoolean(includeCryptoWallet),
      swapOrder: parseBoolean(includeSwapOrder),
    });
  }

  // GET /transactions?userId=abc-123&type=deposit&status=completed&page=2&limit=5
  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('currency') currency?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.transactionService.findAll({
      userId,
      status,
      type,
      currency,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transactionService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateTxDto,
  ) {
    return this.transactionService.updateStatus(id, updateDto);
  }
}
