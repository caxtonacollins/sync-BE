import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  Account,
  RpcProvider,
  RPC,
  uint256,
  shortString,
  CallData,
} from 'starknet';
import {
  connectToStarknet,
  createNewContractInstance,
  getClassAt,
  uuidToFelt252,
  writeAbiToFile,
} from './utils';
import chalk from 'chalk';
import { UserService } from 'src/user/user.service';
import { KeyManagementService } from 'src/wallet/key-management.service';

@Injectable()
export class LiquidityPoolContractService {
  private provider: RpcProvider;
  private liquidityContractAddress: string;
  private accountAddress: string;
  private private_key: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly keyManagementService: KeyManagementService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {
    this.provider = connectToStarknet();
    this.liquidityContractAddress =
      process.env.LIQUIDITY_CONTRACT_ADDRESS || '';
    this.accountAddress = process.env.DEPLOYER_ADDRESS || '';
    this.private_key = process.env.DEPLOYER_PRIVATE_KEY || '';
  }

  /**
   * Register user to liquidity pool
   */
  async registerUserToLiquidity(
    userContractAddress: string,
    fiatAccountId: string,
  ) {
    try {
      if (!userContractAddress) throw new Error('user address is required');
      if (!fiatAccountId) throw new Error('fiat account id is required');

      const fiatAccountIdFelt = uuidToFelt252(fiatAccountId);

      const liquidityClass = await this.provider.getClassAt(
        this.liquidityContractAddress,
      );
      if (!liquidityClass.abi)
        throw new Error('No ABI found for liquidity contract');

      const call = {
        contractAddress: this.liquidityContractAddress,
        entrypoint: 'register_user',
        calldata: [userContractAddress, fiatAccountIdFelt],
      };

      const account = this.getDeployerWallet();

      const { transaction_hash: txH } = await account.execute(call, {
        version: 3,
        maxFee: 10 ** 15,
        feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
        tip: 10 ** 13,
        paymasterData: [],
      });

      const txR = await this.provider.waitForTransaction(txH);
      if (txR.isSuccess()) {
        console.log('Paid fee =', txR.statusReceipt);
        // Invalidate registration cache
        await this.invalidateUserRegistrationCache(userContractAddress);
      }
      return 'success';
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Check if user is registered with caching
   */
  async isUserRegistered(userContractAddress: string) {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');
    if (!userContractAddress) throw new Error('user address is required');

    // Check cache first
    const cacheKey = `liquidity:registered:${userContractAddress}`;
    const cachedResult = await this.cacheManager.get<boolean>(cacheKey);
    if (cachedResult !== undefined) {
      console.log(`[Cache Hit] User registration status for ${userContractAddress}`);
      return cachedResult;
    }

    const liquidityClass = await getClassAt(this.liquidityContractAddress);
    await writeAbiToFile(liquidityClass, 'liquidityAbi');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result =
      await liquidityContract.is_user_registered(userContractAddress);

    // Cache for 2 minutes
    await this.cacheManager.set(cacheKey, result, 120000);

    return result;
  }

  /**
   * Add fiat liquidity
   */
  async addFiatToLiquidity(symbol: string, amount: string) {
    if (!symbol) throw new Error('symbol is required');
    if (!amount) throw new Error('amount is required');

    const symbolFelt = uuidToFelt252(symbol);
    const amountU256 = uint256.bnToUint256(BigInt(amount));

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'add_fiat_liquidity',
      calldata: [symbolFelt, amountU256.low, amountU256.high],
    };

    const account = this.getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      console.log('Paid fee =', txR.statusReceipt);
      // Invalidate fiat balance cache
      await this.cacheManager.del(`liquidity:fiat:${symbol}`);
    }
  }

  /**
   * Add token liquidity
   */
  async addTokenToLiquidity(symbol: string, amount: string) {
    if (!symbol) throw new Error('symbol is required');
    if (!amount) throw new Error('amount is required');

    const amountU256 = uint256.bnToUint256(BigInt(amount));
    const symbolFelt = uuidToFelt252(symbol);

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'add_token_liquidity',
      calldata: [symbolFelt, amountU256.low, amountU256.high],
    };

    const account = this.getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      console.log('Paid fee =', txR.statusReceipt);
    }
  }

  /**
   * Add supported token
   */
  async addSupportedToken(symbol: string, address: string) {
    if (!symbol) throw new Error('symbol is required');
    if (!address) throw new Error('address is required');

    const symbolFelt = shortString.encodeShortString(symbol);

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'add_supported_token',
      calldata: [symbolFelt, address],
    };

    const account = this.getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      maxFee: 10 ** 15,
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      console.log('Paid fee =', txR.statusReceipt);
      // Invalidate supported token cache
      await this.cacheManager.del(`liquidity:token:${symbol}`);
    }
  }

  /**
   * Get token amount in USD with caching
   */
  async getTokenAmountInUsd(address: string) {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');
    if (!address) throw new Error('address is required');

    // Check cache first
    const cacheKey = `liquidity:price:${address}`;
    const cachedPrice = await this.cacheManager.get(cacheKey);
    if (cachedPrice) {
      console.log(`[Cache Hit] Token price for ${address}`);
      return cachedPrice;
    }

    const decimals = await this.getTokenDecimals(address);
    const decimalsPower = BigInt(10) ** BigInt(decimals);

    const liquidityClass = await getClassAt(this.liquidityContractAddress);
    await writeAbiToFile(liquidityClass, 'liquidityAbi');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const pricePerToken = await liquidityContract.get_token_amount_in_usd(
      address,
      decimalsPower,
    );

    // Cache for 30 seconds (prices change frequently)
    await this.cacheManager.set(cacheKey, pricePerToken, 30000);

    return pricePerToken;
  }

  /**
   * Swap fiat to token
   */
  async swapFiatToToken(
    userContractAddress: string,
    fiatSymbol: string,
    tokenSymbol: string,
    fiatAmount: number,
    swapOrderId: string,
  ) {
    if (!userContractAddress)
      throw new Error('userContractAddress is required');
    if (!fiatSymbol) throw new Error('fiatSymbol is required');
    if (!tokenSymbol) throw new Error('tokenSymbol is required');
    if (!fiatAmount) throw new Error('fiatAmount is required');

    const fiatSymbolFelt = shortString.encodeShortString(fiatSymbol);
    const tokenSymbolFelt = shortString.encodeShortString(tokenSymbol);
    const amountU256 = uint256.bnToUint256(BigInt(fiatAmount));
    const swapOrderIdToFelt = uuidToFelt252(swapOrderId);

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'swap_fiat_to_token',
      calldata: [
        userContractAddress,
        swapOrderIdToFelt,
        fiatSymbolFelt,
        tokenSymbolFelt,
        amountU256.low,
        amountU256.high,
      ],
    };

    try {
      const account = this.getDeployerWallet();

      const { transaction_hash: txH } = await account.execute(call, {
        maxFee: 10 ** 15,
      });

      const txR = await this.provider.waitForTransaction(txH);

      if (txR.isSuccess()) {
        console.log(
          chalk.green(
            `Successfully swapped fiat to token for user ${userContractAddress}`,
          ),
        );
        return {
          transactionHash: txH,
          receipt: txR,
        };
      } else {
        throw new Error('Swap transaction failed');
      }
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Swap token to fiat
   */
  async swapTokenToFiat(
    userContractAddress: string,
    fiatSymbol: string,
    tokenSymbol: string,
    tokenAmount: string,
    swapOrderId: string,
    tokenAddress: string,
  ) {
    if (!userContractAddress)
      throw new Error('userContractAddress is required');
    if (!fiatSymbol) throw new Error('fiatSymbol is required');
    if (!tokenSymbol) throw new Error('tokenSymbol is required');
    if (!tokenAmount) throw new Error('tokenAmount is required');

    const user =
      await this.userService.getUserByCryptoAddress(userContractAddress);
    if (!user) throw new Error('User not found');

    const swapOrderIdToFelt = uuidToFelt252(swapOrderId);
    const fiat = 'USD';
    const token = tokenSymbol.toUpperCase();
    const amountU256 = uint256.bnToUint256(BigInt(tokenAmount));
    const tokenSymbolToUSD = `${token}/USD`;
    const supportedTokenAddress =
      await this.getSupportedTokenBySymbol(tokenSymbolToUSD);

    try {
      const feeBpsResult = await this.getFeeBPS();
      const feeBps = BigInt(feeBpsResult);
      const fee = (BigInt(tokenAmount) * feeBps) / 10000n;
      const amountAfterFee = BigInt(tokenAmount) - fee;

      const pricePerToken = await this.getTokenAmountInUsd(
        supportedTokenAddress,
      );

      const decimals = await this.getTokenDecimals(supportedTokenAddress);
      const decimalsPower = BigInt(Math.pow(10, decimals));
      const calculatedFiatAmount =
        BigInt(amountAfterFee * BigInt(pricePerToken)) / decimalsPower;

      const availableFiat = await this.getFiatLiquidityBalance(fiat);

      if (availableFiat < calculatedFiatAmount) {
        throw new Error(
          `Insufficient fiat liquidity. Available: ${availableFiat}, Required: ${calculatedFiatAmount}`,
        );
      }
    } catch (error) {
      throw new Error(`Pre-swap validation failed: ${error.message}`);
    }

    const swapCall = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'swap_token_to_fiat',
      calldata: [
        userContractAddress,
        swapOrderIdToFelt,
        fiatSymbol,
        tokenSymbolToUSD,
        amountU256.low,
        amountU256.high,
      ],
    };

    try {
      const account = this.getDeployerWallet();
      await this.approveTokenWithUserCredentials(
        user.id,
        tokenAddress,
        this.liquidityContractAddress,
        BigInt(tokenAmount),
      );

      const txResponse = await account.execute(swapCall);
      console.log(`[Swap] Transaction submitted:`, txResponse.transaction_hash);

      return {
        txHash: txResponse.transaction_hash,
        status: 'pending',
        details: {
          from: token,
          to: fiat,
          amount: tokenAmount,
        },
      };
    } catch (error) {
      console.error(`[Swap] Failed ${token}->${fiat} swap:`, error);
      throw new Error(`Swap failed: ${error.message}`);
    }
  }

  /**
   * Get fee BPS with caching
   */
  async getFeeBPS() {
    const cacheKey = 'liquidity:fee:bps';
    const cachedFee = await this.cacheManager.get(cacheKey);
    if (cachedFee) {
      console.log('[Cache Hit] Fee BPS');
      return BigInt(cachedFee as string);
    }

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result = await liquidityContract.get_fee_bps();
    const feeBps = BigInt(result);

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, feeBps.toString(), 300000);

    return feeBps;
  }

  /**
   * Get fiat liquidity balance with caching
   */
  async getFiatLiquidityBalance(fiatSymbol: string) {
    const cacheKey = `liquidity:fiat:${fiatSymbol}`;
    const cachedBalance = await this.cacheManager.get(cacheKey);
    if (cachedBalance) {
      console.log(`[Cache Hit] Fiat balance for ${fiatSymbol}`);
      return BigInt(cachedBalance as string);
    }

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result = await liquidityContract.get_fiat_balance(fiatSymbol);
    const balance = BigInt(result);

    // Cache for 30 seconds
    await this.cacheManager.set(cacheKey, balance.toString(), 30000);

    return balance;
  }

  /**
   * Get supported token by symbol with caching
   */
  async getSupportedTokenBySymbol(symbol: string) {
    const cacheKey = `liquidity:token:${symbol}`;
    const cachedToken = await this.cacheManager.get<string>(cacheKey);
    if (cachedToken) {
      console.log(`[Cache Hit] Supported token for ${symbol}`);
      return cachedToken;
    }

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const symbolFelt = shortString.encodeShortString(symbol);
    const result =
      await liquidityContract.get_supported_tokens_by_symbol(symbolFelt);

    // Cache for 10 minutes
    await this.cacheManager.set(cacheKey, result, 600000);

    return result;
  }

  /**
   * Transfer liquidity ownership
   */
  async transferLiquidityOwnership(newOwnerAddress: string) {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');
    if (!newOwnerAddress) throw new Error('newOwnerAddress is required');

    try {
      console.log(
        `Transferring ownership of liquidity contract ${this.liquidityContractAddress} to ${newOwnerAddress}`,
      );

      const call = {
        contractAddress: this.liquidityContractAddress,
        entrypoint: 'transfer_ownership',
        calldata: [newOwnerAddress],
      };

      const account = this.getDeployerWallet();

      console.log(
        chalk.blue('Executing liquidity ownership transfer transaction...'),
      );

      const { transaction_hash: txH } = await account.execute(call, {
        maxFee: 10 ** 15,
      });

      console.log(chalk.green('Transaction hash:'), txH);
      console.log(chalk.blue('Waiting for transaction confirmation...'));
      const txR = await this.provider.waitForTransaction(txH);

      if (txR.isSuccess()) {
        console.log(
          chalk.green(
            `Successfully transferred liquidity ownership to ${newOwnerAddress}`,
          ),
        );
        return {
          transactionHash: txH,
          receipt: txR,
        };
      } else {
        throw new Error('Liquidity ownership transfer transaction failed');
      }
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Upgrade liquidity contract
   */
  async upgradeLiquidityContract(classHash: string) {
    if (!classHash) throw new Error('class hash is required');
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');

    if (!this.private_key || !this.accountAddress)
      throw new Error('account credentials required');

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'upgrade',
      calldata: [classHash],
    };

    const account = this.getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      console.log('Paid fee =', txR.statusReceipt);
    }
  }

  /**
   * Update Pragma oracle address
   */
  async upgradePragmaOracleAddress(contractAddress: string) {
    if (!contractAddress) throw new Error('contract address is required');
    if (!this.private_key || !this.accountAddress)
      throw new Error('account credentials required');

    const contractClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!contractClass.abi)
      throw new Error('No ABI found for account factory contract');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'update_pragma_oracle_address',
      calldata: [contractAddress],
    };

    const account = this.getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      console.log('Paid fee =', txR.statusReceipt);
    }
  }

  /**
   * Set liquidity contract address
   */
  setLiquidityContractAddress(address: string) {
    this.liquidityContractAddress = address;
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
    amount: bigint,
  ) {
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
    const account = this.getDeployerWallet();

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

  /**
   * Mint token
   */
  async mintToken(receiverAddress: string, amount: string, syncTokenAddress: string) {
    if (!receiverAddress) throw new Error('receiverAddress is required');
    if (!amount) throw new Error('amount is required');

    const call = {
      contractAddress: syncTokenAddress,
      entrypoint: 'mint',
      calldata: [receiverAddress, uint256.bnToUint256(amount)],
    };

    try {
      const account = this.getDeployerWallet();

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

  /**
   * Get token decimals (placeholder - should be implemented properly)
   */
  private async getTokenDecimals(tokenAddress: string): Promise<number> {
    // TODO: Implement proper token decimals fetching
    return 18;
  }

  /**
   * Get deployer wallet
   */
  private getDeployerWallet() {
    if (!this.provider || !this.accountAddress || !this.private_key)
      throw new Error("credentials required to deploy deployer's wallet");
    return new Account(this.provider, this.accountAddress, this.private_key);
  }

  /**
   * Invalidate user registration cache
   */
  private async invalidateUserRegistrationCache(userContractAddress: string) {
    await this.cacheManager.del(`liquidity:registered:${userContractAddress}`);
  }
}
