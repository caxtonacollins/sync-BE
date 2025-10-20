import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import axios from 'axios';

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

@Injectable()
export class FlutterwaveService {
  private readonly currencies = ['NGN']; //'GBP', 'USD', 'EUR'
  private readonly baseUrl = 'https://api.flutterwave.com/v3';
  private readonly headers: Record<string, string>;

  constructor() {
    this.headers = {
      'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
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
      
      return response.data.data.map(bank => ({
        name: bank.name,
        code: bank.code,
        isSyncPayment: false
      }));
    } catch (error) {
      console.error('Error fetching banks from Flutterwave:', error.response?.data || error.message);
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
      const response = await axios.get(
        `${this.baseUrl}/transfers/rates`,
        {
          params: {
            amount,
            destination_currency: destinationCurrency,
            source_currency: sourceCurrency,
          },
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          },
        },
      );

      if (response.data.status !== 'success') {
        throw new Error(
          `Failed to fetch exchange rate: ${response.data.message || 'Unknown error'}`,
        );
      }

      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        console.error(`Flutterwave Exchange Rate Error: ${message}`);
        throw new Error(`Failed to fetch exchange rate: ${message}`);
      }
      console.error('Unexpected error in getExchangeRate:', error);
      throw new Error('Failed to fetch exchange rate');
    }
  }

  private async createVirtualAccount(user: User, currency: string) {
    if (!process.env.FLUTTERWAVE_CREATE_VIRTUAL_ACCOUNT_URL) {
      throw new Error("Flutterwave create virtual account URL not found")
    }
    if (!process.env.FLUTTERWAVE_SECRET_KEY) {
      throw new Error("Flutterwave secret key not found")
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
      })


      const response = await axios.post(process.env.FLUTTERWAVE_CREATE_VIRTUAL_ACCOUNT_URL, payload, {
        headers: {
          accept: 'application/json', 'content-type': 'application/json',
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      })
        .then(({ data }) => {
          return data;
        })
        .catch(err => {
          if (axios.isAxiosError(err)) {
            const message = err.response?.data?.message || err.message;
            console.error(`Flutterwave Error ${message}`);
          } else {
            console.error(`Unexpected error: ${err.message}`);
          }
          return null;
        });

      if (response?.status === 'success') {
        console.log(`Virtual account created for ${user.email} in ${currency}`);
        return response.data;
      } else {
        return null;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          `Flutterwave Error ${error.response?.data?.message || error.message}`
        );
      } else {
        console.error(`Error: ${error.message}`);
      }
      throw new Error('Failed to create virtual account.', error);
    }
  }

  async createVirtualAccounts(user: User) {
    const accounts: any[] = [];
    for (const currency of this.currencies) {
      const account = await this.createVirtualAccount(user, currency);
      accounts.push(account);
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
        options
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
        options
      );

      if (response.data.status === 'success') {
        return response.data;
      }
      throw new Error(response.data.message || 'Failed to delete virtual account');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.message;
        console.error(`Flutterwave Delete Account Error: ${message}`);
        throw new Error(`Failed to delete virtual account: ${message}`);
      }
      console.error(`Unexpected error deleting virtual account: ${error.message}`);
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
        options
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

}
