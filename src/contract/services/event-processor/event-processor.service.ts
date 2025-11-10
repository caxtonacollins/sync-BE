import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { SwapOrderService } from 'src/swap-order/swap-order.service';
import { ExchangeRateService } from 'src/exchange-rate/exchange-rate.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { felt252ToUuid } from 'src/contract/utils';

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
    private readonly swapOrderService: SwapOrderService;
    private readonly exchangeRateService: ExchangeRateService

    constructor(
        private readonly prisma: PrismaService,
        @Inject(forwardRef(() => SwapOrderService))
        swapOrderService: SwapOrderService,
        @Inject(forwardRef(() => ExchangeRateService))
        exchangeRateService: ExchangeRateService,
    ) {
        this.swapOrderService = swapOrderService;
        this.exchangeRateService = exchangeRateService;
    }

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
        console.log('event', evt);

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
        const { fiat_symbol, amount } = evt.data;
        const parsedAmount = parseFloat(amount);
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
            swap_order_id,
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
        await this.completeNearestPendingOrder(evt);
    }

    /**
     * Handle TokenToFiatSwapExecuted event from StarkNet
     * This confirms the swap was successful on-chain
     * After updating the order, trigger the fiat payout
     */
    private async handleTokenToFiatSwap(evt: EventPayload) {
        const completedOrderId = await this.completeNearestPendingOrder(evt);

        console.log('completedNearestPendingOrder', completedOrderId);

        if (completedOrderId) {
            try {
                this.logger.log(`Triggering payout for swap order ${completedOrderId}`);
                await this.swapOrderService.initiatePayoutForSwap(completedOrderId);
            } catch (error) {
                this.logger.error(
                    `Failed to trigger payout for swap ${completedOrderId}: ${error.message}`,
                    error.stack,
                );
            }
        }
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
            where: {
                fiatSymbol_tokenSymbol: {
                    fiatSymbol: fiat_symbol,
                    tokenSymbol: token_symbol,
                },
            },
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
        const { user: token_account_id, fiat_account_id: user_id } = evt.data;

        const userUuid = felt252ToUuid(user_id);
        this.logger.log(`User Registered: ${token_account_id} | Account: ${userUuid}`);

        await this.prisma.cryptoWallet.updateMany({
            where: { address: token_account_id },
            data: {
                isRegisteredToLiquidity: true,
            },
        });

        this.logger.log(
            `Linked crypto wallet ${token_account_id} to user ${userUuid}`,
        );
    }

    /**
     * Find and complete a pending swap order that matches the event data
     * Returns the completed order ID for further processing (e.g., triggering payout)
     */
    private async completeNearestPendingOrder(
        evt: EventPayload,
    ): Promise<string | null> {
        const {
            user,
            swap_order_id,
            fiat_symbol,
            token_symbol,
            token_amount,
            fee,
        } = evt.data;

        // get exchange rate
        const tokenSymbolWithoutUSD = token_symbol.replace(/\/usd$/i, '');

        const exchangeRate = await this.exchangeRateService.getExchangeRateFor([tokenSymbolWithoutUSD.toLowerCase(), fiat_symbol.toLowerCase()]);
        // convert to fiat amount
        const tokenRate = exchangeRate[tokenSymbolWithoutUSD.toLowerCase()];
        const fiatRate = exchangeRate[fiat_symbol.toLowerCase()];
        const fiat_amount = (token_amount / Math.pow(10, 18)) * tokenRate * fiatRate;

        const swapOrderUuid = felt252ToUuid(swap_order_id);

        const pendingSwapOrder = await this.prisma.swapOrder.findFirst({
            where: {
                id: swapOrderUuid,
                status: { in: ['pending', 'processing', 'payout_failed'] },
            },
            orderBy: { createdAt: 'asc' },
        });

        if (!pendingSwapOrder) {
            this.logger.warn(
                `No pending/processing swap order found for ${user}: ${token_amount} ${token_symbol} → ${fiat_amount} ${fiat_symbol}`,
            );
            return null;
        }

        this.logger.log(`Completing swap order ${pendingSwapOrder.id}`);

        // Update swap order status to completed
        await this.prisma.swapOrder.update({
            where: { id: pendingSwapOrder.id },
            data: {
                status: 'completed',
                completedAt: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
                toAmount: fiat_amount,
                fee: parseFloat(fee),
                blockNumber: evt.blockNumber,
                transactionHash: evt.transactionHash,
            },
        });

        // Create or update transaction record for completed swap
        await this.prisma.transaction.upsert({
            where: { reference: pendingSwapOrder.reference },
            update: {
                status: 'completed',
                blockNumber: evt.blockNumber,
                transactionHash: evt.transactionHash,
                completedAt: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
            },
            create: {
                userId: pendingSwapOrder.userId,
                type: 'swap',
                status: 'completed',
                amount: parseFloat(token_amount),
                currency: token_symbol,
                fee: parseFloat(fee),
                netAmount: fiat_amount,
                reference: pendingSwapOrder.reference,
                swapOrderId: pendingSwapOrder.id,
                blockNumber: evt.blockNumber,
                transactionHash: evt.transactionHash,
                completedAt: new Date(parseInt(evt.blockTimestamp, 10) * 1000),
            },
        });

        console.log('created transaction record for completed swap');

        return pendingSwapOrder.id;
    }
}
