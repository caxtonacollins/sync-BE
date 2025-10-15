import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FiatAccount } from '@prisma/client';
import axios from 'axios';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly flutterwaveSecretKey: string;
  private readonly flutterwaveBaseUrl: string;

  constructor(private readonly flutterwaveService: FlutterwaveService) {
    this.flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || '';
    this.flutterwaveBaseUrl = 'https://api.flutterwave.com/v3';
  }

  /**
   * Initiate payout to user's fiat account via Flutterwave
   * This is called after swap confirmation from StarkNet
   */
  async initiatePayout(
    fiatAccount: FiatAccount,
    amount: number,  // in USD
    currency: string,
  ) {
    try {
      const exchangeRateResponse = await this.flutterwaveService.getExchangeRate(
        'USD',
        currency,
        amount,
      );
      const payoutAmount = exchangeRateResponse.destination.amount;
      const payoutReference = `PAYOUT_${Date.now()}_${fiatAccount.id}`;

      // Convert amount to smallest currency unit (kobo for NGN, cents for USD, etc.)
      const amountInSubunit = Math.round(payoutAmount * 100);
      
      // First, verify the bank account details
      const accountVerification = await this.verifyBankAccount(
        fiatAccount.accountNumber,
        fiatAccount.bankCode?.toString() || "",
        currency
      );

      // Prepare transfer payload
      const transferPayload = {
        account_bank: fiatAccount.bankCode,
        account_number: fiatAccount.accountNumber,
        amount: amountInSubunit,
        currency: currency.toUpperCase(),
        narration: 'Swap payout from Sync',
        reference: payoutReference,
        callback_url: `${process.env.NEXT_PUBLIC_API_URL}/api/payment/webhook/flutterwave`,
        debit_currency: currency.toUpperCase(),
        beneficiary_name: accountVerification.account_name || 'Sync User',
      };

      this.logger.debug('Initiating transfer with payload:', transferPayload);

      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/transfers`,
        transferPayload,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000, // 20 seconds timeout
        },
      );

      if (response.data.status === 'success') {
        this.logger.log(`Payout initiated successfully: ${payoutReference}`);
        return {
          status: 'success',
          reference: payoutReference,
          data: response.data.data,
        };
      } else {
        throw new Error(response.data.message || 'Payout initiation failed');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      this.logger.error(`Payout failed: ${errorMessage}`, error.stack);
      throw new BadRequestException(`Failed to initiate payout: ${errorMessage}`);
    }
  }

  /**
   * Verify bank account details before initiating transfer
   */
  private async verifyBankAccount(accountNumber: string, bankCode: string, currency: string) {
    try {
      this.logger.debug(`Verifying bank account: ${accountNumber} for bank code: ${bankCode}`);
      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/accounts/resolve`,
        {
          account_number: accountNumber,
          account_bank: bankCode,
        },
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data.status !== 'success') {
        throw new Error(response.data.message || 'Account verification failed');
      }

      return response.data.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      this.logger.error(`Bank account verification failed: ${errorMessage}`);
      throw new Error(`Invalid bank account details: ${errorMessage}`);
    }
  }

  /**
   * Charge user's fiat account via Flutterwave
   * This is called before initiating fiat-to-token swap
   */
  async charge(fiatAccount: FiatAccount, amount: number, currency: string) {
    this.logger.log(
      `Charging ${amount} ${currency} from account ${fiatAccount.accountNumber}`,
    );

    try {
      const chargeReference = `CHARGE_${Date.now()}_${fiatAccount.id}`;

      // TODO: Implement Flutterwave Charge API
      // For virtual accounts, charges happen automatically when user deposits
      // We just need to verify the balance is sufficient

      // TODO: Uncomment when Flutterwave credentials are ready
      /*
      // Verify account balance first
      const balanceResponse = await axios.get(
        `${this.flutterwaveBaseUrl}/virtual-account-numbers/${fiatAccount.accountReference}`,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
          },
        },
      );

      const availableBalance = balanceResponse.data.data.available_balance || 0;
      if (availableBalance < amount) {
        throw new BadRequestException('Insufficient balance in fiat account');
      }
      */

      // Mock response for development
      this.logger.warn(
        `MOCK CHARGE: ${amount} ${currency} from ${fiatAccount.accountNumber}`,
      );
      return {
        status: 'success',
        reference: chargeReference,
        message: 'Charge completed (mock mode)',
      };
    } catch (error) {
      this.logger.error(`Charge failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to charge account: ${error.message}`);
    }
  }

  /**
   * Verify Flutterwave transfer status
   * Used to confirm payout completion
   */
  async verifyTransfer(reference: string) {
    try {
      // TODO: Implement Flutterwave Transfer verification
      /*
      const response = await axios.get(
        `${this.flutterwaveBaseUrl}/transfers?reference=${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
          },
        },
      );

      return response.data;
      */

      this.logger.warn(`MOCK VERIFY: Transfer ${reference}`);
      return { status: 'success', reference };
    } catch (error) {
      this.logger.error(`Transfer verification failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get account balance from Flutterwave
   */
  async getAccountBalance(fiatAccount: FiatAccount): Promise<number> {
    try {
      // TODO: Implement Flutterwave balance check
      /*
      const response = await axios.get(
        `${this.flutterwaveBaseUrl}/virtual-account-numbers/${fiatAccount.accountReference}`,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
          },
        },
      );

      return response.data.data.available_balance || 0;
      */

      this.logger.warn(`MOCK BALANCE CHECK: ${fiatAccount.accountNumber}`);
      return 100000; // Mock balance
    } catch (error) {
      this.logger.error(`Balance check failed: ${error.message}`);
      return 0;
    }
  }
}
