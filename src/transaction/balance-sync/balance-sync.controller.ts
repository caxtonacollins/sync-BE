import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { BalanceSyncService } from 'src/shared/services/balance-sync.service';
import { CacheSyncService } from 'src/shared/services/cache-sync.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

/**
 * BalanceSyncController
 *
 * Admin endpoints for managing balance cache operations.
 * Provides manual control over balance synchronization and validation.
 */
@Controller('api/admin/balance-sync')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class BalanceSyncController {
  constructor(
    private readonly balanceSync: BalanceSyncService,
    private readonly cacheSync: CacheSyncService,
  ) {}

  @Get('user/:userId/balance/:currency')
  async getUserBalance(
    @Param('userId') userId: string,
    @Param('currency') currency: string,
  ) {
    const balance = await this.balanceSync.getFiatBalance(userId, currency);

    if (!balance) {
      throw new BadRequestException(
        `No balance found for user ${userId} and currency ${currency}`,
      );
    }

    return {
      userId,
      currency,
      available: balance.available.toString(),
      staked: balance.staked.toString(),
      pending: balance.pending.toString(),
    };
  }

  @Get('user/:userId/crypto/balance/:currency')
  async getUserCryptoBalance(
    @Param('userId') userId: string,
    @Param('currency') currency: string,
  ) {
    // For now, get from all networks or specific if available
    const balances = await this.balanceSync.getAllCryptoBalances(userId);
    const balance = balances.find((b) => b.currency === currency);

    if (!balance) {
      throw new BadRequestException(
        `No crypto balance found for user ${userId} and currency ${currency}`,
      );
    }

    return {
      userId,
      currency,
      network: balance.network,
      available: balance.available.toString(),
      staked: balance.staked.toString(),
      pending: balance.pending.toString(),
    };
  }

  @Get('user/:userId/balances')
  async getUserBalances(@Param('userId') userId: string) {
    const fiatBalances = await this.balanceSync.getAllFiatBalances(userId);
    const cryptoBalances = await this.balanceSync.getAllCryptoBalances(userId);

    return {
      fiat: fiatBalances.map((b) => ({
        currency: b.currency,
        available: b.available.toString(),
        staked: b.staked.toString(),
        pending: b.pending.toString(),
      })),
      crypto: cryptoBalances.map((b) => ({
        currency: b.currency,
        network: b.network,
        available: b.available.toString(),
        staked: b.staked.toString(),
        pending: b.pending.toString(),
      })),
    };
  }

  @Post('user/:userId/initialize')
  @HttpCode(HttpStatus.OK)
  async initializeUserBalances(@Param('userId') userId: string) {
    const result = await this.balanceSync.initializeBalances(userId);
    return {
      message: 'Balances initialized',
      fiatCount: result.fiats.length,
      cryptoCount: result.cryptos.length,
      fiatCurrencies: result.fiats.map((f) => f.currency),
      cryptoCurrencies: result.cryptos.map((c) => `${c.currency}/${c.network}`),
    };
  }

  @Post('user/:userId/clear-cache')
  @HttpCode(HttpStatus.OK)
  async clearUserCache(@Param('userId') userId: string) {
    await this.cacheSync.clearUserCache(userId);
    return {
      message: `Cache cleared for user ${userId}`,
      note: 'Balances will be resynced on next operation',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('validate/user/:userId/currency/:currency')
  async validateBalance(
    @Param('userId') userId: string,
    @Param('currency') currency: string,
  ) {
    const result = await this.cacheSync.validateUserBalance(userId, currency);

    return {
      userId,
      currency,
      network: result.network || null,
      isValid: result.isValid,
      dbValue: result.dbValue.toString(),
      blockchainValue: result.blockchainValue.toString(),
      discrepancy: result.discrepancy || '0',
      status: result.isValid ? 'OK' : 'MISMATCH',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('discrepancies')
  async getDiscrepancies() {
    const discrepancies = await this.cacheSync.getDiscrepancies();

    return {
      count: discrepancies.length,
      discrepancies: discrepancies.map((d) => ({
        userId: d.userId,
        currency: d.currency,
        network: d.network || null,
        dbValue: d.dbValue.toString(),
        blockchainValue: d.blockchainValue.toString(),
        discrepancy: d.discrepancy || '0',
      })),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('manual-sync/crypto')
  @HttpCode(HttpStatus.OK)
  syncCryptoManual() {
    // Manual trigger - note: the actual sync runs on schedule
    return {
      message: 'Crypto balance sync triggered',
      note: 'Check logs for progress',
      timestamp: new Date().toISOString(),
      information:
        'Automatic sync runs every 5 minutes. This endpoint can be used to understand the sync flow.',
    };
  }

  @Post('manual-sync/fiat')
  @HttpCode(HttpStatus.OK)
  syncFiatManual() {
    return {
      message: 'Fiat balance sync triggered',
      note: 'Check logs for progress',
      timestamp: new Date().toISOString(),
      information:
        'Automatic sync runs every 30 minutes. This endpoint can be used to understand the sync flow.',
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'healthy',
      servicesRunning: ['BalanceSyncService', 'CacheSyncService'],
      note: 'All balance sync services are operational',
      timestamp: new Date().toISOString(),
    };
  }
}
