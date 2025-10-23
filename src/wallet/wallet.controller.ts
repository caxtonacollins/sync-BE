import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  ValidationPipe,
  BadRequestException,
  UseInterceptors,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Logger } from '@nestjs/common';
import { CreateFiatAccountDto } from './dto/create-fiat-account.dto';
import { CreateCryptoWalletDto } from './dto/create-crypto-wallet.dto';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  /**
   * Get unified wallet balance
   */
  @Get('balance')
  async getBalance(@Request() req: { user: { sub: string } }) {
    try {
      const userId = req.user.sub;
      if (!userId) {
        throw new BadRequestException('User ID not found in request');
      }
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
  @UseInterceptors(CacheInterceptor)
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
   * Get fiat accounts
   */
  @Get('fiat-accounts')
  async getFiatAccounts(@Request() req) {
    try {
      const userId = req.user.sub;
      if (!userId) {
        throw new BadRequestException('User ID not found in request');
      }
      return await this.walletService.getFiatAccounts(userId);
    } catch (error) {
      this.logger.error('Failed to get fiat accounts:', error);
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
}
