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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Logger } from '@nestjs/common';
import { CreateCryptoWalletDto } from '../../types/dto/dto/create-crypto-wallet.dto';
import { CacheInterceptor } from '@nestjs/cache-manager';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @UseInterceptors(CacheInterceptor)
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
        createCryptoWalletDto.tokenSymbol,
      );
    } catch (error) {
      this.logger.error('Failed to create crypto wallet:', error);
      throw error;
    }
  }
}
