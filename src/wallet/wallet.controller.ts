import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Logger } from '@nestjs/common';
import { CreateFiatAccountDto } from './dto/create-fiat-account.dto';
import { CreateCryptoWalletDto } from './dto/create-crypto-wallet.dto';
import { BridgeLiquidityDto } from './dto/bridge-liquidity.dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  /**
   * Get unified wallet balance
   */
  @Get('balance')
  async getBalance(@Request() req) {
    try {
      const userId = req.user.sub;
      return await this.walletService.getUnifiedBalance(userId);
    } catch (error) {
      this.logger.error('Failed to get wallet balance:', error);
      throw error;
    }
  }

  /**
   * Get wallet summary for dashboard
   */
  @Get('summary')
  async getSummary(@Request() req) {
    try {
      const userId = req.user.sub;
      return await this.walletService.getWalletSummary(userId);
    } catch (error) {
      this.logger.error('Failed to get wallet summary:', error);
      throw error;
    }
  }

  /**
   * Get transaction history
   */
  @Get('transactions')
  async getTransactions(
    @Request() req,
    @Query('limit') limit?: string,
  ) {
    try {
      const userId = req.user.sub;
      
      // Validate limit parameter
      let transactionLimit = 50;
      if (limit) {
        const parsedLimit = parseInt(limit, 10);
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
          throw new BadRequestException('Limit must be a number between 1 and 100');
        }
        transactionLimit = parsedLimit;
      }
      
      return await this.walletService.getTransactionHistory(userId, transactionLimit);
    } catch (error) {
      this.logger.error('Failed to get transaction history:', error);
      throw error;
    }
  }

  /**
   * Create fiat account
   */
  @Post('fiat-account')
  @HttpCode(HttpStatus.CREATED)
  async createFiatAccount(
    @Request() req,
    @Body(ValidationPipe) createFiatAccountDto: CreateFiatAccountDto,
  ) {
    try {
      const userId = req.user.sub;
      
      if (!userId) {
        throw new BadRequestException('User ID is required');
      }
      
      return await this.walletService.createFiatAccount(
        userId,
        createFiatAccountDto.currency,
      );
    } catch (error) {
      this.logger.error('Failed to create fiat account:', error);
      throw error;
    }
  }

  /**
   * Create crypto wallet
   */
  @Post('crypto-wallet')
  @HttpCode(HttpStatus.CREATED)
  async createCryptoWallet(
    @Request() req,
    @Body(ValidationPipe) createCryptoWalletDto: CreateCryptoWalletDto,
  ) {
    try {
      const userId = req.user.sub;
      
      if (!userId) {
        throw new BadRequestException('User ID is required');
      }
      
      return await this.walletService.createCryptoWallet(
        userId,
        createCryptoWalletDto.currency,
      );
    } catch (error) {
      this.logger.error('Failed to create crypto wallet:', error);
      throw error;
    }
  }

  /**
   * Bridge liquidity between fiat and crypto
   */
  @Post('bridge')
  @HttpCode(HttpStatus.ACCEPTED)
  async bridgeLiquidity(
    @Request() req,
    @Body(ValidationPipe) bridgeLiquidityDto: BridgeLiquidityDto,
  ) {
    try {
      const userId = req.user.sub;
      
      if (!userId) {
        throw new BadRequestException('User ID is required');
      }
      
      // Additional business logic validation
      if (bridgeLiquidityDto.fromType === bridgeLiquidityDto.toType) {
        throw new BadRequestException('Cannot bridge between same wallet types');
      }
      
      if (bridgeLiquidityDto.fromCurrency === bridgeLiquidityDto.toCurrency) {
        throw new BadRequestException('Cannot bridge between same currencies');
      }
      
      return await this.walletService.bridgeLiquidity(
        userId,
        bridgeLiquidityDto.fromType,
        bridgeLiquidityDto.toType,
        bridgeLiquidityDto.fromCurrency,
        bridgeLiquidityDto.toCurrency,
        bridgeLiquidityDto.amount,
      );
    } catch (error) {
      this.logger.error('Failed to bridge liquidity:', error);
      throw error;
    }
  }
}
