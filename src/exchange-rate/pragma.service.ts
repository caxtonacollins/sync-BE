import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import WebSocket from 'ws';

@Injectable()
export class PragmaService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket;
  private readonly logger = new Logger(PragmaService.name);
  private rates: Map<string, number> = new Map();

  private pingInterval: NodeJS.Timeout;

  private readonly pairs = [
    'BTC/USD',
    'ETH/USD',
    'STRK/USD',
    'USDC/USD',
  ];

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.disconnect();
  }

  private connect() {
    this.ws = new WebSocket('wss://ws.devnet.pragma.build/node/v1/data/price/subscribe');

    this.ws.on('open', () => {
      this.logger.log('Connected to Pragma WebSocket API');
      this.subscribeToPairs();
      this.startPing();
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString());
      if (message.oracle_prices) {
        message.oracle_prices.forEach(price => {
          const scaledPrice = Number(price.price) / Math.pow(10, 18);
          this.rates.set(price.pair_id, scaledPrice);
          this.logger.log(`Updated rate for ${price.pair_id}: ${scaledPrice}`);
        });
      }
    });

    this.ws.on('close', () => {
      this.logger.warn('Disconnected from Pragma WebSocket API. Reconnecting...');
      this.stopPing();
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (error) => {
      this.logger.error('Pragma WebSocket error:', error);
      this.ws.close();
    });
  }

  private disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.stopPing();
  }

  private subscribeToPairs() {
    const subscribeMsg = {
      msg_type: 'subscribe',
      pairs: this.pairs,
    };
    this.ws.send(JSON.stringify(subscribeMsg));
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000); // Send ping every 30 seconds
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }

  getRate(pair: string): number | undefined {
    return this.rates.get(pair);
  }

  getRates(pairs: string[]): (number | undefined)[] {
    return pairs.map(pair => this.rates.get(pair));
  }
}
