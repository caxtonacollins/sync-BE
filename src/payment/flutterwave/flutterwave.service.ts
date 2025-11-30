import { Injectable } from '@nestjs/common';
import { VirtualAccountUser } from '../../types/domain';
import axios, { AxiosError } from 'axios';
import { WalletService } from 'src/transaction/wallet/wallet.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { BalanceService } from 'src/payment/balance.service';
import { PrismaService } from 'src/prisma/prisma.service';

export interface ExchangeRateResponse {
  rate: number;
  source: {
    currency: string;
    amount: number;
  };
  destination: {
    currency: string;
    amount: number;
  };
}

export interface VirtualAccountDetails {
  id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  bank_code: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  tx_ref: string;
  bvn?: string;
  nin?: string;
}

@Injectable()
export class FlutterwaveService {
  private readonly currencies = ['NGN']; //'GBP', 'USD', 'EUR'
  private readonly baseUrl = 'https://api.flutterwave.com/v3';
  private readonly headers: Record<string, string>;

  /**
   * Get user by ID
   * @param userId - The ID of the user to fetch
   * @returns Promise with the user object
   */
  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        fiatAccounts: true,
        cryptoWallets: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  constructor(
    private prisma: PrismaService,
    private balanceService: BalanceService,
    private auditLogService: AuditLogService,
  ) {
    this.headers = {
      Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Fetches the list of banks from Flutterwave
   * @returns Promise with the list of banks
   */
  async getBanks() {
    try {
      const response = await axios.get(`${this.baseUrl}/banks/NG`, {
        headers: this.headers,
      });

      return response.data.data.map((bank) => ({
        name: bank.name,
        code: bank.code,
        isSyncPayment: false,
      }));
    } catch (error) {
      console.error(
        'Error fetching banks from Flutterwave:',
        error.response?.data || error.message,
      );
      throw new Error('Failed to fetch banks. Please try again later.');
    }
  }

  /**
   * Fetches the exchange rate between two currencies
   * @param sourceCurrency - 3-letter ISO currency code of the source currency (e.g., 'KES')
   * @param destinationCurrency - 3-letter ISO currency code of the destination currency (e.g., 'USD')
   * @param amount - The amount in the destination currency to convert from
   * @returns Promise with the exchange rate and converted amounts
   */
  async getExchangeRate(
    sourceCurrency: string,
    destinationCurrency: string,
    amount: number,
  ): Promise<ExchangeRateResponse> {
    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error('Flutterwave secret key not found');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/transfers/rates`, {
        params: {
          amount,
          destination_currency: destinationCurrency,
          source_currency: sourceCurrency,
        },
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      });

      if (response.data.status !== 'success') {
        throw new Error(
          `Failed to fetch exchange rate: ${response.data.message || 'Unknown error'}`,
        );
      }

      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        console.error(
          `Flutterwave Exchange Rate Error [${status}]: ${message}`,
        );
        throw new Error(
          `Failed to fetch exchange rate: [${status}] ${message}`,
        );
      }
      console.error('Unexpected error in getExchangeRate:', error);
      throw new Error('Failed to fetch exchange rate: Unexpected error');
    }
  }
  /**
   * Creates a virtual account for a user
   * @param user - The user to create the account for
   * @param currency - The currency for the virtual account
   * @returns The created virtual account details
   */
  private async createVirtualAccount(user: VirtualAccountUser, currency: string): Promise<VirtualAccountDetails | null> {
    if (!process.env.FLUTTERWAVE_CREATE_VIRTUAL_ACCOUNT_URL) {
      throw new Error('Flutterwave create virtual account URL not found');
    }
    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error('Flutterwave secret key not found');
    }

    try {
      const payload = JSON.stringify({
        email: user.email,
        currency,
        amount: 0,
        firstname: user.firstName,
        lastname: user.lastName,
        tx_ref: user.id,
        is_permanent: true,
        narration: user.firstName + ' ' + user.lastName,
        phonenumber: user.phoneNumber,
        bvn: user.bvn,
        nin: user.nin,
      });

      const response = await axios
        .post(process.env.FLUTTERWAVE_CREATE_VIRTUAL_ACCOUNT_URL, payload, {
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          },
        })
        .then(({ data }) => {
          return data;
        })
        .catch((err) => {
          if (axios.isAxiosError(err)) {
            const message = err.response?.data?.message || err.message;
            console.error(`Flutterwave Error ${message}`);
            console.error(`Unexpected error: ${err.message}`);
          }
          return null;
        });

      if (response?.status === 'success' && response.data) {
        return {
          id: response.data.id,
          account_number: response.data.account_number,
          account_name: response.data.account_name,
          bank_name: response.data.bank_name,
          bank_code: response.data.bank_code,
          currency: response.data.currency,
          status: response.data.status,
          created_at: response.data.created_at,
          updated_at: response.data.updated_at,
          is_active: response.data.is_active,
          tx_ref: response.data.tx_ref,
          bvn: response.data.bvn,
          nin: response.data.nin
        };
      } else if (response?.status === 'error') {
        throw new Error(response?.message || 'Failed to create virtual account');
      } else {
        throw new Error('Failed to create virtual account: Unknown error');
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Flutterwave Error ${error.response?.data?.message || error.message}`,
        );
      } else {
        console.error(`Error: ${error.message}`);
      }
      throw new Error('Failed to create virtual account.', error);
    }
  }

  /**
   * Creates virtual accounts for a user in all supported currencies
   * @param user - The user to create accounts for
   * @returns An array of created virtual accounts
   */
  async createVirtualAccounts(user: VirtualAccountUser): Promise<VirtualAccountDetails[]> {
    const accounts: VirtualAccountDetails[] = [];
    for (const currency of this.currencies) {
      const account = await this.createVirtualAccount(user, currency);
      if (account) {
        accounts.push(account);
      }
    }
    return accounts;
  }

  async updateBVN(orderRef: string, bvn: string) {
    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error('Flutterwave secret key not found');
    }

    try {
      const options = {
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      };

      const response = await axios.put(
        `https://api.flutterwave.com/v3/virtual-account-numbers/${orderRef}`,
        { bvn },
        options,
      );

      if (response.data.status === 'success') {
        return response.data;
      }
      throw new Error(response.data.message || 'Failed to update BVN');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        console.error(`Flutterwave BVN Update Error: ${message}`);
        throw new Error(`Failed to update BVN: ${message}`);
      }
      console.error(`Unexpected error updating BVN: ${error.message}`);
      throw new Error('Failed to update BVN');
    }
  }

  async deleteVirtualAccount(orderRef: string) {
    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error('Flutterwave secret key not found');
    }

    try {
      const options = {
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      };

      const response = await axios.post(
        `https://api.flutterwave.com/v3/virtual-account-numbers/${orderRef}`,
        { status: 'inactive' },
        options,
      );

      if (response.data.status === 'success') {
        return response.data;
      }
      throw new Error(
        response.data.message || 'Failed to delete virtual account',
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        console.error(`Flutterwave Delete Account Error: ${message}`);
        throw new Error(`Failed to delete virtual account: ${message}`);
      }
      console.error(
        `Unexpected error deleting virtual account: ${error.message}`,
      );
      throw new Error('Failed to delete virtual account');
    }
  }

  async getVirtualAccount(ref: string) {
    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error('Flutterwave secret key not found');
    }

    try {
      const options = {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      };

      const response = await axios.get(
        `https://api.flutterwave.com/v3/virtual-account-numbers/${ref}`,
        options,
      );

      const data = response.data;

      if (data.status === 'success') {
        console.log(`Virtual account retrieved for ${ref}`);
        return data.data; // contains account details
      } else {
        console.error(`Flutterwave: ${data.message}`);
        return null;
      }
    } catch (err: any) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message = err.response?.data?.message || err.message;
        console.error(`Flutterwave Error [${status}]: ${message}`);
      } else {
        console.error(`Unexpected Error: ${err.message}`);
      }
      return null;
    }
  }



  async verifyPayment(transactionId: string, userId: string, amount: number, currency: string = 'NGN') {
    try {
      // Verify transaction with Flutterwave
      const response = await axios.get(
        `${this.baseUrl}/transactions/${transactionId}/verify`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          },
        },
      );

      const { data } = response.data;

      // Check if payment was successful
      if (data.status !== 'successful' || data.amount !== amount || data.currency !== currency) {
        throw new Error('Payment verification failed: Invalid transaction status or amount');
      }

      // Credit user's wallet
      await this.balanceService.creditAccount(userId, amount, currency, 'Payment via Flutterwave'); // TODO properly implement this function

      // Calculate fee and net amount
      const fee = parseFloat(data.app_fee) || 0;
      const netAmount = amount - fee;

      // Create transaction record
      const transaction = await this.prisma.transaction.create({
        data: {
          userId,
          amount,
          currency,
          type: 'deposit',
          status: 'completed',
          reference: data.tx_ref,
          netAmount: netAmount,
          fee: fee,
          metadata: {
            flutterwaveTransactionId: data.id,
            paymentMethod: data.payment_type,
            paymentProvider: 'flutterwave',
          },
        },
      });

      // Log the successful payment
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'PAYMENT_PROCESSED',
          entityType: 'transaction',
          entityId: transaction.id,
          metadata: {
            amount,
            currency,
            provider: 'flutterwave',
            transactionId: data.id,
          },
        }
      });

      return {
        success: true,
        transactionId: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        reference: transaction.reference,
      };
    } catch (error) {
      console.error('Payment verification error:', error);

      // Log the failed payment attempt
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'PAYMENT_FAILED',
          entityType: 'transaction',
          metadata: {
            error: error.message,
            transactionId,
            amount,
            currency,
            provider: 'flutterwave',
          },
        }
      });

      throw new Error(`Payment verification failed: ${error.message}`);
    }
  }
}
