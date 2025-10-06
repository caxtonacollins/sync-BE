import { Injectable } from '@nestjs/common';
import { getAccessToken } from './utils';
import { User } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class MonnifyService {
  async createReserveAccount(user: User) {
    try {
      const accessToken = await getAccessToken();
      const firstName = user.firstName;
      const lastName = user.lastName;

      const accountName = `${lastName}-${firstName}`;

      const payload = {
        accountReference: user.id,
        accountName: accountName,
        currencyCode: 'NGN',
        contractCode: process.env.MONNIFY_CONTRACT_CODE,
        customerEmail: user.email,
        customerName: `${user.firstName} ${user.lastName}`,
        getAllAvailableBanks: true,
      };

      const configurations = {
        method: 'post',
        url: process.env.MONNIFY_RESERVE_ACCT_URL,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: payload,
      };

      const response = await axios(configurations);

      if (response.status === 200) {
        // Account created successfully.
        console.log(`Account created successfully, ${accountName}`);
        return response.data;
      } else {
        // Handle errors or failed responses.
        console.error('message response:' + response.data);
      }
    } catch (error: any) {
      // Handle error response
      if (error.response) {
        console.error('Server responded with:', error.response.status);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received:', error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Request setup error:', error.message);
        throw new Error(error.message as string);
      }
    }
  }

  async getReservedAccountDetails(userId: any) {
    try {
      const accountReference = userId;
      const URL = `${process.env.MONNIFY_RESERVE_GET_ACCT_DETAILS_URL}/${accountReference}`;
      const accessToken = await getAccessToken();

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      const response = await axios.get(URL, { headers });

      const accounts = response.data.responseBody.accounts;
      return { accounts };
    } catch (error) {
      if (error.response) {
        console.error("Monnify Error:", error.response.data);
        throw new Error(error.response.data.responseMessage);
      } else {
        console.error("Unexpected Error:", error.message);
      }
    }
  }

  async getNigerianBanks() {
    return [
      { name: 'Access Bank', code: '044' },
      { name: 'Guaranty Trust Bank', code: '058' },
      { name: 'Zenith Bank', code: '057' },
      { name: 'First Bank of Nigeria', code: '011' },
      { name: 'United Bank for Africa', code: '033' },
      { name: 'Fidelity Bank', code: '070' },
      { name: 'Union Bank of Nigeria', code: '032' },
      { name: 'Stanbic IBTC Bank', code: '221' },
      { name: 'Sterling Bank', code: '232' },
      { name: 'Polaris Bank', code: '076' },
      { name: 'Wema Bank', code: '035' },
      { name: 'Ecobank Nigeria', code: '050' },
      { name: 'OPay', code: '999992' },
      { name: 'PalmPay', code: '999991' },
      { name: 'Kuda Bank', code: '090267' },
    ];
  }
}
