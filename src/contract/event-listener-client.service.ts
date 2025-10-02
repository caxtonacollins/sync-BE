import { Injectable, Logger } from '@nestjs/common';
import { EventFilter } from 'starknet';

export interface EventListenerStatus {
  initialized: boolean;
  isConnected: boolean;
  activeSubscriptions: number;
  subscriptions: any[];
  config: {
    nodeUrl: string;
    autoReconnect: boolean;
  };
}

export interface SubscriptionResponse {
  success: boolean;
  subscriptionId?: string;
  message: string;
  error?: string;
}

@Injectable()
export class EventListenerClientService {
  private readonly logger = new Logger(EventListenerClientService.name);
  private readonly baseUrl: string;
  private isAvailable = false;

  constructor() {
    this.baseUrl = process.env.EVENT_LISTENER_URL || 'http://localhost:5001';
  }

  /**
   * Check if event listener service is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      this.isAvailable = response.ok;
      return response.ok;
    } catch (error) {
      this.isAvailable = false;
      this.logger.warn('Event listener service is not available');
      return false;
    }
  }

  /**
   * Initialize the event listener WebSocket connection
   */
  async initialize(): Promise<{ success: boolean; message: string; status?: EventListenerStatus }> {
    try {
      const response = await fetch(`${this.baseUrl}/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      
      if (data.success) {
        this.isAvailable = true;
        this.logger.log('Event listener initialized successfully');
      }

      return data;
    } catch (error: any) {
      this.logger.error('Failed to initialize event listener:', error.message);
      return {
        success: false,
        message: `Failed to connect to event listener service: ${error.message}`,
      };
    }
  }

  /**
   * Get event listener status
   */
  async getStatus(): Promise<EventListenerStatus | null> {
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      this.logger.error('Failed to get event listener status:', error.message);
      return null;
    }
  }

  /**
   * Subscribe to new block headers
   */
  async subscribeToNewHeads(callbackUrl?: string): Promise<SubscriptionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/subscribe/new-heads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl }),
      });

      return await response.json();
    } catch (error: any) {
      this.logger.error('Failed to subscribe to new heads:', error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Subscribe to contract events
   */
  async subscribeToContractEvents(
    contractAddress: string,
    eventFilter?: Partial<EventFilter>,
    callbackUrl?: string
  ): Promise<SubscriptionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/subscribe/contract-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractAddress,
          eventFilter,
          callbackUrl,
        }),
      });

      return await response.json();
    } catch (error: any) {
      this.logger.error('Failed to subscribe to contract events:', error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Subscribe to transaction status
   */
  async subscribeToTransactionStatus(
    transactionHash: string,
    callbackUrl?: string
  ): Promise<SubscriptionResponse> {
    try {
      const response = await fetch(
        `${this.baseUrl}/subscribe/transaction-status/${transactionHash}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callbackUrl }),
        }
      );

      return await response.json();
    } catch (error: any) {
      this.logger.error('Failed to subscribe to transaction status:', error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Subscribe to pending transactions
   */
  async subscribeToPendingTransactions(callbackUrl?: string): Promise<SubscriptionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/subscribe/pending-transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl }),
      });

      return await response.json();
    } catch (error: any) {
      this.logger.error('Failed to subscribe to pending transactions:', error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Unsubscribe from a specific subscription
   */
  async unsubscribe(subscriptionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/subscribe/${subscriptionId}`, {
        method: 'DELETE',
      });

      return await response.json();
    } catch (error: any) {
      this.logger.error('Failed to unsubscribe:', error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Unsubscribe from all subscriptions
   */
  async unsubscribeAll(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/subscribe`, {
        method: 'DELETE',
      });

      return await response.json();
    } catch (error: any) {
      this.logger.error('Failed to unsubscribe all:', error.message);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Send custom RPC request
   */
  async sendCustomRpcRequest(method: string, params?: any[]): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params }),
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message);
      }

      return data.result;
    } catch (error: any) {
      this.logger.error('Failed to send RPC request:', error.message);
      throw error;
    }
  }

  /**
   * Check if service is available
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }
}
