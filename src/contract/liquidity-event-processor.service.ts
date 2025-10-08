import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Event name constants matching Cairo events
const EVENT_NAMES = {
  FiatLiquidityAdded: 'FiatLiquidityAdded',
  TokenLiquidityAdded: 'TokenLiquidityAdded',
  FiatLiquidityRemoved: 'FiatLiquidityRemoved',
  FiatDeposit: 'FiatDeposit',
  FiatToTokenSwapExecuted: 'FiatToTokenSwapExecuted',
  TokenToFiatSwapExecuted: 'TokenToFiatSwapExecuted',
  WithdrawalCompleted: 'WithdrawalCompleted',
  ExchangeRateUpdated: 'ExchangeRateUpdated',
  TokenRegistered: 'TokenRegistered',
  UserRegistered: 'UserRegistered',
};

interface EventPayload {
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  eventIndex: string;
  eventName: string;
  data: {
    name: string;
    [key: string]: any;
  };
}

interface BatchEventPayload {
  events: EventPayload[];
  blockNumber: string;
  timestamp: string;
}

@Injectable()
export class LiquidityEventProcessorService {
  private readonly logger = new Logger(LiquidityEventProcessorService.name);

  constructor(private readonly prisma: PrismaService) { }

  async process(payload: BatchEventPayload | EventPayload | EventPayload[]) {
    try {
      this.logger.log('Processing payload');

      let events: EventPayload[] = [];

      // Handle different payload formats
      if (Array.isArray(payload)) {
        // Array of events
        events = payload;
        this.logger.log(`Processing ${events.length} event(s)`);
      } else if ('events' in payload && Array.isArray(payload.events)) {
        // Batch format from indexer
        events = payload.events;
        this.logger.log(
          `Processing batch for block ${payload.blockNumber} with ${events.length} event(s)`,
        );
      } else {
        // Single event
        events = [payload as EventPayload];
        this.logger.log('Processing single event');
      }

      for (const evt of events) {
        if (!evt.data || !evt.data.name) {
          this.logger.warn('Skipping event without data or name', {
            eventIndex: evt.eventIndex,
            transactionHash: evt.transactionHash,
          });
          continue;
        }

        await this.routeEvent(evt);
      }

      this.logger.log(`Successfully processed ${events.length} event(s)`);
    } catch (err: any) {
      this.logger.error(`Failed processing payload: ${err.message}`, err.stack);
      throw err;
    }
  }

  private async routeEvent(evt: EventPayload) {
    const eventName = evt.data.name;
    console.log("event", evt)

    this.logger.debug(
      `Routing event: ${eventName} | Block: ${evt.blockNumber} | Tx: ${evt.transactionHash}`,
    );


    try {
      switch (eventName) {
        case EVENT_NAMES.FiatLiquidityAdded:
          await this.handleFiatLiquidityAdded(evt);
          break;
        case EVENT_NAMES.TokenLiquidityAdded:
          await this.handleTokenLiquidityAdded(evt);
          break;
        case EVENT_NAMES.FiatLiquidityRemoved:
          await this.handleFiatLiquidityRemoved(evt);
          break;
        case EVENT_NAMES.FiatDeposit:
          await this.handleFiatDeposit(evt);
          break;

        case EVENT_NAMES.FiatToTokenSwapExecuted:
          await this.handleFiatToTokenSwap(evt);
          break;

        case EVENT_NAMES.TokenToFiatSwapExecuted:
          await this.handleTokenToFiatSwap(evt);
          break;

        case EVENT_NAMES.WithdrawalCompleted:
          await this.handleWithdrawalCompleted(evt);
          break;

        case EVENT_NAMES.ExchangeRateUpdated:
          await this.handleExchangeRateUpdated(evt);
          break;

        case EVENT_NAMES.TokenRegistered:
          await this.handleTokenRegistered(evt);
          break;

        case EVENT_NAMES.UserRegistered:
          await this.handleUserRegistered(evt);
          break;

        default:
          this.logger.debug(`Ignoring unknown event: ${eventName}`);
      }
    } catch (err: any) {
      this.logger.error(
        `Error handling ${eventName}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  private async updateLiquidityPool(
    evt: EventPayload,
    symbol: string,
    type: 'fiat' | 'token',
    amount: number,
    operation: 'add' | 'remove',
  ) {
    const pool = await this.prisma.liquidityPool.upsert({
      where: { symbol },
      update: {
        balance: {
          [operation === 'add' ? 'increment' : 'decrement']: amount,
        },
        lastUpdated: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
      },
      create: {
        symbol,
        type,
        balance: amount,
        lastUpdated: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
      },
    });

    await this.prisma.poolHistory.create({
      data: {
        poolId: pool.id,
        amount: amount,
        type: operation,
        transactionHash: evt.transactionHash,
        blockNumber: evt.blockNumber,
        timestamp: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
      },
    });

    this.logger.log(
      `Liquidity ${operation}: ${amount} ${symbol} | New Balance: ${pool.balance}`,
    );
  }

  private async handleFiatLiquidityAdded(evt: EventPayload) {
    const { fiat_symbol, amount_formatted, amount } = evt.data;
    const parsedAmount = parseFloat(amount_formatted || amount);
    await this.updateLiquidityPool(
      evt,
      fiat_symbol,
      'fiat',
      parsedAmount,
      'add',
    );
  }

  private async handleTokenLiquidityAdded(evt: EventPayload) {
    const { token_symbol, amount_formatted, amount } = evt.data;
    const parsedAmount = parseFloat(amount_formatted || amount);
    await this.updateLiquidityPool(
      evt,
      token_symbol,
      'token',
      parsedAmount,
      'add',
    );
  }

  private async handleFiatLiquidityRemoved(evt: EventPayload) {
    const { fiat_symbol, amount_formatted, amount } = evt.data;
    const parsedAmount = parseFloat(amount_formatted || amount);
    await this.updateLiquidityPool(
      evt,
      fiat_symbol,
      'fiat',
      parsedAmount,
      'remove',
    );
  }

  private async handleFiatDeposit(evt: EventPayload) {
    const {
      user,
      fiat_account_id,
      fiat_symbol,
      amount,
      amount_formatted,
      transaction_id,
    } = evt.data;

    this.logger.log(
      `Fiat Deposit: ${amount_formatted || amount} ${fiat_symbol} | User: ${user} | Ref: ${transaction_id}`,
    );

    if (!transaction_id) {
      this.logger.warn('FiatDeposit missing transaction_id, skipping');
      return;
    }

    const wallet = await this.prisma.cryptoWallet.findFirst({
      where: { address: user },
    });

    if (!wallet) {
      this.logger.warn(`User with address ${user} not found for fiat deposit.`);
      return;
    }

    // Upsert transaction as deposit acknowledgement
    await this.prisma.transaction.upsert({
      where: { reference: transaction_id },
      update: {
        status: 'completed',
        completedAt: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
        blockNumber: evt.blockNumber,
        transactionHash: evt.transactionHash,
      },
      create: {
        userId: wallet.userId,
        type: 'deposit',
        status: 'completed',
        amount: parseFloat(amount_formatted || amount),
        currency: fiat_symbol || 'USD',
        netAmount: parseFloat(amount_formatted || amount),
        reference: transaction_id,
        blockNumber: evt.blockNumber,
        transactionHash: evt.transactionHash,
        completedAt: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
      },
    });
  }

  private async handleFiatToTokenSwap(evt: EventPayload) {
    const {
      user,
      fiat_symbol,
      token_symbol,
      fiat_amount,
      fiat_amount_formatted,
      token_amount,
      token_amount_formatted,
      fee,
      fee_formatted,
    } = evt.data;

    const fiatAmt = parseFloat(fiat_amount_formatted || fiat_amount || '0');
    const tokenAmt = parseFloat(token_amount_formatted || token_amount || '0');
    const feeAmt = parseFloat(fee_formatted || fee || '0');

    this.logger.log(
      `Fiat→Token Swap: ${fiatAmt} ${fiat_symbol} → ${tokenAmt} ${token_symbol} | Fee: ${feeAmt}`,
    );

    // Find and complete matching pending swap order
    await this.completeNearestPendingOrder(
      user,
      fiat_symbol,
      token_symbol,
      fiatAmt,
      tokenAmt,
      feeAmt,
      evt,
    );
  }

  private async handleTokenToFiatSwap(evt: EventPayload) {
    const {
      user,
      fiat_symbol,
      token_symbol,
      fiat_amount,
      fiat_amount_formatted,
      token_amount,
      token_amount_formatted,
      fee,
      fee_formatted,
    } = evt.data;

    const fiatAmt = parseFloat(fiat_amount_formatted || fiat_amount || '0');
    const tokenAmt = parseFloat(token_amount_formatted || token_amount || '0');
    const feeAmt = parseFloat(fee_formatted || fee || '0');

    this.logger.log(
      `Token→Fiat Swap: ${tokenAmt} ${token_symbol} → ${fiatAmt} ${fiat_symbol} | Fee: ${feeAmt}`,
    );

    // Find and complete matching pending swap order
    await this.completeNearestPendingOrder(
      user,
      token_symbol,
      fiat_symbol,
      tokenAmt,
      fiatAmt,
      feeAmt,
      evt,
    );
  }

  private async handleWithdrawalCompleted(evt: EventPayload) {
    const { user, token_symbol, amount, amount_formatted, fiat_reference } =
      evt.data;

    this.logger.log(
      `Withdrawal Completed: ${amount_formatted || amount} ${token_symbol} | Ref: ${fiat_reference}`,
    );

    if (!fiat_reference) {
      this.logger.warn('WithdrawalCompleted missing fiat_reference');
      return;
    }

    // Update transaction status
    const updateResult = await this.prisma.transaction.updateMany({
      where: {
        reference: fiat_reference,
        userId: user,
      },
      data: {
        status: 'completed',
        completedAt: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
        blockNumber: evt.blockNumber,
        transactionHash: evt.transactionHash,
      },
    });

    if (updateResult.count === 0) {
      this.logger.warn(
        `No transaction found to update for withdrawal ref: ${fiat_reference}`,
      );
    } else {
      this.logger.log(
        `Updated ${updateResult.count} transaction(s) for withdrawal ref: ${fiat_reference}`,
      );
    }
  }

  private async handleExchangeRateUpdated(evt: EventPayload) {
    const { fiat_symbol, token_symbol, new_rate, new_rate_formatted } =
      evt.data;
    const rate = parseFloat(new_rate_formatted || new_rate);

    this.logger.log(
      `Exchange Rate Updated: ${fiat_symbol}/${token_symbol} = ${rate}`,
    );

    await this.prisma.exchangeRate.upsert({
      where: { fiatSymbol_tokenSymbol: { fiatSymbol: fiat_symbol, tokenSymbol: token_symbol } },
      update: {
        rate: rate,
      },
      create: {
        fiatSymbol: fiat_symbol,
        tokenSymbol: token_symbol,
        rate: rate,
      },
    });
  }

  private async handleTokenRegistered(evt: EventPayload) {
    const { token_symbol, token_address } = evt.data;

    this.logger.log(`Token Registered: ${token_symbol} at ${token_address}`);

    // NOTE: No RegisteredToken model in schema, so just logging.
    // If you add the model, you can upsert it here.
  }

  private async handleUserRegistered(evt: EventPayload) {
    const { user, fiat_account_id } = evt.data;

    this.logger.log(`User Registered: ${user} | Account: ${fiat_account_id}`);

    const wallet = await this.prisma.cryptoWallet.findFirst({
      where: { address: user },
    });

    if (wallet) {
      await this.prisma.fiatAccount.updateMany({
        where: { id: fiat_account_id, userId: wallet.userId },
        data: {
          // You might want to add a field to FiatAccount to mark it as contract-linked
        },
      });
      this.logger.log(`Linked fiat account ${fiat_account_id} to user ${wallet.userId}`);
    } else {
      this.logger.warn(`Could not find user for wallet address ${user} to link fiat account.`);
    }
  }

  private async completeNearestPendingOrder(
    user: string,
    fromCurrency: string,
    toCurrency: string,
    fromAmount: number,
    toAmount: number,
    fee: number,
    evt: EventPayload,
  ) {
    // Find pending swap order matching the criteria
    const pending = await this.prisma.swapOrder.findFirst({
      where: {
        userId: user,
        status: 'pending',
        fromCurrency,
        toCurrency,
        // Allow some tolerance for amount matching (e.g., due to rounding)
        fromAmount: {
          gte: fromAmount * 0.99,
          lte: fromAmount * 1.01,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!pending) {
      this.logger.warn(
        `No pending swap order found for ${user}: ${fromAmount} ${fromCurrency} → ${toCurrency}`,
      );
      return;
    }

    this.logger.log(`Completing swap order ${pending.id}`);

    // Update swap order status
    await this.prisma.swapOrder.update({
      where: { id: pending.id },
      data: {
        status: 'completed',
        completedAt: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
        toAmount,
        fee,
        blockNumber: evt.blockNumber,
        transactionHash: evt.transactionHash,
      },
    });

    // Create transaction record for completed swap
    await this.prisma.transaction.create({
      data: {
        userId: pending.userId,
        type: 'swap',
        status: 'completed',
        amount: fromAmount,
        currency: fromCurrency,
        fee,
        netAmount: toAmount,
        reference: pending.reference,
        swapOrderId: pending.id,
        blockNumber: evt.blockNumber,
        transactionHash: evt.transactionHash,
        completedAt: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
      },
    });
  }
}