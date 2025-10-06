import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Minimal event name constants derived from Cairo events
const EVENT_NAMES = {
  FiatLiquidityAdded: 'FiatLiquidityAdded',
  TokenLiquidityAdded: 'TokenLiquidityAdded',
  FiatLiquidityRemoved: 'FiatLiquidityRemoved',
  FiatDeposit: 'FiatDeposit',
  FiatToTokenSwapExecuted: 'FiatToTokenSwapExecuted',
  TokenToFiatSwapExecuted: 'TokenToFiatSwapExecuted',
  WithdrawalCompleted: 'WithdrawalCompleted',
};

@Injectable()
export class LiquidityEventProcessorService {
  private readonly logger = new Logger(LiquidityEventProcessorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(payload: any) {
    // Payload shape is forwarded from the event-listener service
    try {
      const events = this.extractEvents(payload);
      for (const evt of events) {
        await this.routeEvent(evt);
      }
    } catch (err: any) {
      this.logger.error(`Failed processing payload: ${err.message}`);
      throw err;
    }
  }

  private extractEvents(payload: any): Array<{ name: string; data: any }> {
    // Accept both single and batched events
    if (Array.isArray(payload?.events)) {
      return payload.events.map((e: any) => ({ name: e.event_name || e.name, data: e }));
    }
    if (payload?.event_name || payload?.name) {
      return [{ name: payload.event_name || payload.name, data: payload }];
    }
    // Starknet WS may deliver in chunks under "result.events"
    const chunk = payload?.result?.events || [];
    return chunk.map((e: any) => ({ name: e.event_name || e.name, data: e }));
  }

  private async routeEvent(evt: { name: string; data: any }) {
    switch (evt.name) {
      case EVENT_NAMES.FiatLiquidityAdded:
      case EVENT_NAMES.TokenLiquidityAdded:
      case EVENT_NAMES.FiatLiquidityRemoved:
        return this.handlePoolDelta(evt);
      case EVENT_NAMES.FiatDeposit:
        return this.handleFiatDeposit(evt);
      case EVENT_NAMES.FiatToTokenSwapExecuted:
        return this.handleFiatToTokenSwap(evt);
      case EVENT_NAMES.TokenToFiatSwapExecuted:
        return this.handleTokenToFiatSwap(evt);
      case EVENT_NAMES.WithdrawalCompleted:
        return this.handleWithdrawalCompleted(evt);
      default:
        this.logger.debug(`Ignoring unknown event: ${evt.name}`);
    }
  }

  private async handlePoolDelta(evt: { name: string; data: any }) {
    this.logger.log(`Pool delta: ${evt.name}`);
    // Could persist aggregate liquidity stats for monitoring in the future
  }

  private async handleFiatDeposit(evt: { name: string; data: any }) {
    this.logger.log('FiatDeposit detected - marking pending fiat→token orders as ready');
    // Upsert a Transaction record as deposit acknowledgement if we have a reference
    const reference = evt.data?.transaction_id || evt.data?.transactionId;
    if (reference) {
      await this.prisma.transaction.upsert({
        where: { reference },
        update: { status: 'completed', completedAt: new Date() },
        create: {
          userId: String(evt.data?.user || ''),
          type: 'deposit',
          status: 'completed',
          amount: Number(this.tryToNumber(evt.data?.amount)),
          currency: 'USD',
          netAmount: Number(this.tryToNumber(evt.data?.amount)),
          reference,
        },
      });
    }
  }

  private async handleFiatToTokenSwap(evt: { name: string; data: any }) {
    // When fiat→token executed, complete the matching SwapOrder
    const fiatAmount = Number(this.tryToNumber(evt.data?.fiat_amount));
    const tokenSymbol = this.tryToAscii(evt.data?.token_symbol) || 'TOKEN';
    const fiatSymbol = this.tryToAscii(evt.data?.fiat_symbol) || 'USD';
    this.logger.log(`Fiat→Token executed: ${fiatAmount} ${fiatSymbol} -> ${tokenSymbol}`);

    await this.completeNearestPendingOrder(fiatSymbol, tokenSymbol, fiatAmount);
  }

  private async handleTokenToFiatSwap(evt: { name: string; data: any }) {
    // When token→fiat executed, complete the matching SwapOrder
    const tokenAmount = Number(this.tryToNumber(evt.data?.token_amount));
    const tokenSymbol = this.tryToAscii(evt.data?.token_symbol) || 'TOKEN';
    const fiatSymbol = this.tryToAscii(evt.data?.fiat_symbol) || 'USD';
    this.logger.log(`Token→Fiat executed: ${tokenAmount} ${tokenSymbol} -> ${fiatSymbol}`);

    // Mark matching order completed (best-effort match on currencies & pending status)
    await this.completeNearestPendingOrder(tokenSymbol, fiatSymbol, tokenAmount);
  }

  private async handleWithdrawalCompleted(evt: { name: string; data: any }) {
    const reference = this.tryToAscii(evt.data?.fiat_reference) || undefined;
    if (!reference) return;
    await this.prisma.transaction.updateMany({
      where: { reference },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  private async completeNearestPendingOrder(fromCurrency: string, toCurrency: string, amount: number) {
    const pending = await this.prisma.swapOrder.findFirst({
      where: { status: 'pending', fromCurrency, toCurrency },
      orderBy: { createdAt: 'asc' },
    });
    if (!pending) return;

    await this.prisma.swapOrder.update({
      where: { id: pending.id },
      data: { status: 'completed', completedAt: new Date() },
    });

    await this.prisma.transaction.create({
      data: {
        userId: pending.userId,
        type: 'swap',
        status: 'completed',
        amount: pending.fromAmount,
        currency: pending.fromCurrency,
        fee: pending.fee,
        netAmount: pending.toAmount,
        reference: pending.reference,
        swapOrderId: pending.id,
      },
    });
  }

  private tryToAscii(v: any): string | undefined {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    return undefined;
  }

  private tryToNumber(v: any): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number(v);
    if (v && typeof v.low !== 'undefined' && typeof v.high !== 'undefined') {
      // naive u256 conversion
      return Number(BigInt(v.high) << BigInt(128)) + Number(BigInt(v.low));
    }
    return 0;
  }
}


