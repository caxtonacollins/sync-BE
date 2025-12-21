import { Injectable } from '@nestjs/common';
import { RpcProvider, uint256, CallData, Uint256 } from 'starknet';
import {
  connectToStarknet,
  createNewContractInstance,
  getDeployerWallet,
} from '../../utils';
import erc20 from '../../abi/erc20.json';
import { TokenBalance } from '../../../types';
import chalk from 'chalk';
import { KeyManagementService } from 'src/transaction/wallet/key-management.service';

@Injectable()
export class TokenContractService {
  private provider: RpcProvider;
  private readonly _syncTokenAddress: string;
  private readonly _strkTokenAddress: string;
  private readonly _usdcTokenAddress: string;
  private readonly _ethTokenAddress: string;
  private readonly _btcTokenAddress: string;
  private readonly _sngnTokenAddress: string;

  private readonly tokenAddressMap: Record<string, string>;
  private readonly decimalsMap: Record<string, number>;

  constructor(private readonly keyManagementService: KeyManagementService) {
    this.provider = connectToStarknet();
    this._syncTokenAddress = process.env.SYNC_TOKEN_ADDRESS || '';
    this._strkTokenAddress = process.env.STRK_TOKEN_ADDRESS || '';
    this._usdcTokenAddress = process.env.USDC_TOKEN_ADDRESS || '';
    this._ethTokenAddress = process.env.ETH_TOKEN_ADDRESS || '';
    this._btcTokenAddress = process.env.BTC_TOKEN_ADDRESS || '';
    this._sngnTokenAddress = process.env.SNGN_TOKEN_ADDRESS || '';

    this.tokenAddressMap = {
      SYNC: this._syncTokenAddress,
      STRK: this._strkTokenAddress,
      USDC: this._usdcTokenAddress,
      ETH: this._ethTokenAddress,
      BTC: this._btcTokenAddress,
      SNGN: this._sngnTokenAddress,
    };

    this.decimalsMap = {
      SYNC: 18,
      STRK: 18,
      USDC: 6,
      ETH: 18,
      BTC: 18,
      SNGN: 18, // sNGN uses 18 decimals (1 Naira = 1 sNGN)
    };
  }

  get syncTokenAddress(): string {
    return this._syncTokenAddress;
  }

  get strkTokenAddress(): string {
    return this._strkTokenAddress;
  }

  get usdcTokenAddress(): string {
    return this._usdcTokenAddress;
  }

  get ethTokenAddress(): string {
    return this._ethTokenAddress;
  }

  get btcTokenAddress(): string {
    return this._btcTokenAddress;
  }

  async mintToken(
    receiverAddress: string,
    amount: string,
    syncTokenAddress: string,
  ) {
    if (!receiverAddress) throw new Error('receiverAddress is required');
    if (!amount) throw new Error('amount is required');

    const call = {
      contractAddress: syncTokenAddress,
      entrypoint: 'mint',
      calldata: [receiverAddress, uint256.bnToUint256(amount)],
    };

    try {
      const account = getDeployerWallet();

      const { transaction_hash: txH } = await account.execute(call, {
        maxFee: 10 ** 15,
      });

      const txR = await this.provider.waitForTransaction(txH);

      if (txR.isSuccess()) {
        console.log(
          chalk.green(`Successfully minted token for user ${receiverAddress}`),
        );
        return {
          transactionHash: txH,
          receipt: txR,
        };
      } else {
        throw new Error('Mint transaction failed');
      }
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async getAccountBalance(
    symbol: string,
    accountAddress: string,
  ): Promise<string> {
    if (!symbol) throw new Error('symbol is required');
    if (!accountAddress) throw new Error('accountAddress is required');

    const tokenAddress = this.tokenAddressMap[symbol.toUpperCase()];
    if (!tokenAddress) {
      throw new Error(`Token with symbol ${symbol} not supported`);
    }

    try {
      const tokenContract = createNewContractInstance(erc20, tokenAddress);
      const balance = await tokenContract.balance_of(accountAddress);
      const decimals = this.decimalsMap[symbol.toUpperCase()] || 18;

      // Convert from smallest unit to human-readable format
      const balanceFormatted = Number(balance) / Math.pow(10, decimals);

      return balanceFormatted.toString();
    } catch (error) {
      console.error(
        `Error fetching balance for ${symbol} for account ${accountAddress}:`,
        error,
      );
      throw error; // Re-throw the error to be handled by the caller
    }
  }

  async getMultipleAccountBalances(
    symbols: string[],
    userAddress: string,
  ): Promise<TokenBalance[]> {
    if (!symbols || symbols.length === 0)
      throw new Error('symbols array is required');
    if (!userAddress) throw new Error('userAddress is required');

    const balancePromises = symbols.map(async (symbol) => {
      try {
        const formattedBalance = await this.getAccountBalance(
          symbol,
          userAddress,
        );
        const decimals = this.decimalsMap[symbol.toUpperCase()] || 18;

        return {
          symbol,
          balance: formattedBalance,
          raw: formattedBalance,
          formatted: formattedBalance,
          decimals: decimals,
        } as TokenBalance;
      } catch (error) {
        console.error(
          `Error fetching balance for ${symbol} for account ${userAddress}:`,
          error,
        );
        return null;
      }
    });

    const results = await Promise.all(balancePromises);
    return results.filter((result): result is TokenBalance => result !== null);
  }

  /**
   * Get SYNC token balance (legacy method)
   */
  async getSyncTokenBalance(address: string) {
    if (!address) throw new Error('user address is required');
    return this.getAccountBalance('SYNC', address);
  }

  /**
   * Generate approve token calldata
   */
  getApproveTokenCalldata(
    tokenSymbol: string,
    spenderAddress: string,
    amount: string,
  ) {
    const token = tokenSymbol.toUpperCase();
    const tokenAddress = this.tokenAddressMap[token];

    if (!tokenAddress) {
      throw new Error(`Token ${token} not supported`);
    }

    const decimals = this.decimalsMap[token] || 18;
    const adjustedAmount = BigInt(
      Math.floor(Number(amount) * Math.pow(10, decimals)),
    );
    const amountU256 = uint256.bnToUint256(adjustedAmount);

    return {
      contractAddress: tokenAddress,
      entrypoint: 'approve',
      calldata: [spenderAddress, amountU256.low, amountU256.high],
    };
  }

  /**
   * Get token address by symbol
   */
  getTokenAddress(symbol: string): string {
    const tokenAddress = this.tokenAddressMap[symbol.toUpperCase()];
    if (!tokenAddress) {
      throw new Error(`Token with symbol ${symbol} not supported`);
    }
    return tokenAddress;
  }

  /**
   * Get token decimals by symbol
   */
  getTokenDecimals(symbol: string): number {
    return this.decimalsMap[symbol.toUpperCase()] || 18;
  }

  /**
   * Execute user transaction
   */
  async executeUserTransaction(
    userId: string,
    calls: any[],
  ): Promise<{ transactionHash: string; receipt?: any }> {
    try {
      return await this.keyManagementService.executeTransaction(userId, calls);
    } catch (error) {
      console.error(`Failed to execute user transaction for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Approve token with user credentials
   */
  async approveTokenWithUserCredentials(
    userId: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: Uint256,
  ) {
    const call = {
      contractAddress: tokenAddress,
      entrypoint: 'approve',
      calldata: CallData.compile({
        spender: spenderAddress,
        amount,
      }),
    };

    const result = await this.executeUserTransaction(userId, [call]);
    return result;
  }

  /**
   * Approve token with deployer credentials
   */
  async approveTokenWithDeployerCredentials(
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint,
  ) {
    const account = getDeployerWallet();

    const call = {
      contractAddress: tokenAddress,
      entrypoint: 'approve',
      calldata: CallData.compile({
        spender: spenderAddress,
        amount: {
          low: amount & BigInt('0xFFFFFFFFFFFFFFFF'),
          high: amount >> BigInt(128),
        },
      }),
    };

    const result = await account.execute(call);
    await this.provider.waitForTransaction(result.transaction_hash);

    return result;
  }
}
