import {
  Body,
  Controller,
  Get,
  Param,
  Query,
  Patch,
  Post,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateFiatTransferDto } from './dto/create-fiat-transfer.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { TransactionService } from './transaction.service';
import { TxFilterDto } from './dto/tx-filter.dto';
import { UpdateTxDto } from './dto/update-tx.dto';

@ApiTags('Transactions')
@ApiBearerAuth()
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
  @ApiOperation({ summary: 'Get transactions for a specific user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Returns user transactions' })
  @ApiResponse({ status: 400, description: 'Invalid UUID' })
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

  // GET /tx?userId=abc-123&type=deposit&status=completed&page=2&limit=5
  @Get()
  @ApiOperation({ summary: 'Get all transactions' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'currency', required: false })
  @ApiQuery({ name: 'page', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  @ApiResponse({
    status: 200,
    description: 'Returns all transactions based on query parameters',
  })
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
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Returns transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.transactionService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update transaction' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction updated successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateTxDto,
  ) {
    return this.transactionService.updateStatus(id, updateDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fiat')
  transferFiat(@Body() dto: CreateFiatTransferDto, @Req() req) {
    const senderUserId = req.user.sub;
    return this.transactionService.transferFiat(senderUserId, dto.recipientEmail, dto.amount, dto.currency);
  }
}
