import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RpcProvider, RPC, uint256, shortString, stark } from 'starknet';
import {
  connectToStarknet,
  convertToWei,
  createNewContractInstance,
  getClassAt,
  getDeployerWallet,
  uuidToFelt252,
  writeAbiToFile,
} from '../../utils';
import { UserService } from 'src/user/user.service';
import { TokenContractService } from '../erc20-token/erc20-token.service';
import { KeyManagementService } from 'src/transaction/wallet/key-management.service';

@Injectable()
export class LiquidityPoolContractService {
  private readonly logger = new Logger(LiquidityPoolContractService.name);
  private provider: RpcProvider;
  private liquidityContractAddress: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(forwardRef(() => UserService))
    @Inject(forwardRef(() => TokenContractService))
    private readonly userService: UserService,
    private readonly tokenContractService: TokenContractService,
    private readonly keyManagementService: KeyManagementService,
  ) {
    this.provider = connectToStarknet();
    this.liquidityContractAddress =
      process.env.LIQUIDITY_CONTRACT_ADDRESS || '';
  }

  /**
   * Register user to liquidity pool
   */
  async registerUserToLiquidity(
    userContractAddress: string,
    userId: string,
  ) {
    try {
      if (!userContractAddress) throw new Error('user address is required');
      if (!userId) throw new Error('fiat account id is required');

      const userIdFelt = uuidToFelt252(userId);

      const liquidityClass = await this.provider.getClassAt(
        this.liquidityContractAddress,
      );
      if (!liquidityClass.abi)
        throw new Error('No ABI found for liquidity contract');

      const call = {
        contractAddress: this.liquidityContractAddress,
        entrypoint: 'register_user',
        calldata: [userContractAddress, userIdFelt],
      };

      const account = getDeployerWallet();

      const { transaction_hash: txH } = await account.execute(call, {
        version: 3,
        maxFee: 10 ** 15,
        feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
        tip: 10 ** 13,
        paymasterData: [],
      });

      const txR = await this.provider.waitForTransaction(txH);
      if (txR.isSuccess()) {
        this.logger.log(`User registered successfully. Transaction: ${txH}`);
        // Invalidate registration cache
        await this.invalidateUserRegistrationCache(userContractAddress);
      }
      return 'success';
    } catch (error) {
      this.logger.error(`Failed to register user: ${error.message}`, error.stack);
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
      this.logger.debug(`Cache hit: User registration status for ${userContractAddress}`);
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
   * Add token liquidity (replaces add_fiat_liquidity - tokens can represent fiat-backed tokens)
   * Note: The new contract uses add_token_liquidity for all token types
   */
  async addTokenLiquidity(tokenAddress: string, amount: string) {
    if (!tokenAddress) throw new Error('tokenAddress is required');
    if (!amount) throw new Error('amount is required');

    const amountU256 = uint256.bnToUint256(BigInt(amount));

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'add_token_liquidity',
      calldata: [tokenAddress, amountU256.low, amountU256.high],
    };

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Token liquidity added. Transaction: ${txH}`);
      // Invalidate token balance cache
      await this.cacheManager.del(`liquidity:token:balance:${tokenAddress}`);
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

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Token liquidity added. Transaction: ${txH}`);
    }
  }

  /**
   * Add token to liquidity bridge (replaces add_supported_token)
   * The new contract uses add_token with more parameters
   */
  async addSupportedToken(
    symbol: string,
    address: string,
    feedId: string = '0x0',
    decimals: number = 18,
    minAmount: string = '0',
    maxAmount: string = '0',
    isActive: boolean = true,
  ) {
    if (!symbol) throw new Error('symbol is required');
    if (!address) throw new Error('address is required');

    const symbolFelt = shortString.encodeShortString(symbol);
    const feedIdFelt = feedId.startsWith('0x') ? feedId : `0x${feedId}`;
    const minAmountU256 = uint256.bnToUint256(BigInt(minAmount));
    const maxAmountU256 = uint256.bnToUint256(BigInt(maxAmount));

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'add_token',
      calldata: [
        address,
        symbolFelt,
        feedIdFelt,
        decimals,
        minAmountU256.low,
        minAmountU256.high,
        maxAmountU256.low,
        maxAmountU256.high,
        isActive ? 1 : 0,
      ],
    };

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Token added successfully. Transaction: ${txH}`);
      // Invalidate supported token cache
      await this.cacheManager.del(`liquidity:token:${symbol}`);
    }
  }

  async getTokenDecimals(tokenAddress: string): Promise<number> {
    // TODO: Implement proper token decimals fetching
    return 18;
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
      this.logger.debug(`Cache hit: Token price for ${address}`);
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
    tokenAmount: number,
    fee: number,
  ) {
    if (!userContractAddress)
      throw new Error('userContractAddress is required');
    if (!fiatSymbol) throw new Error('fiatSymbol is required');
    if (!tokenSymbol) throw new Error('tokenSymbol is required');
    if (!fiatAmount) throw new Error('fiatAmount is required');

    const user =
      await this.userService.getUserByCryptoAddress(userContractAddress);
    if (!user) throw new Error('User not found');

    const swapOrderIdToFelt = uuidToFelt252(swapOrderId);
    const token = tokenSymbol.toUpperCase();

    // The new contract expects token_symbol as felt252 (shortString encoded)
    const fiatSymbolFelt = shortString.encodeShortString(fiatSymbol);
    const tokenSymbolFelt = shortString.encodeShortString(token);
    const fiatAmountU256 = uint256.bnToUint256(BigInt(fiatAmount));

    // Get token address to determine decimals
    const supportedTokenAddress = await this.getSupportedTokenBySymbol(token);
    const decimals = await this.getTokenDecimals(supportedTokenAddress);

    // Convert token amount to wei units properly handling decimals
    const amountInWei = convertToWei(tokenAmount.toString(), decimals);
    const amountU256 = uint256.bnToUint256(amountInWei);

    const swapCall = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'swap_fiat_to_token',
      calldata: [
        userContractAddress,
        swapOrderIdToFelt,
        fiatSymbolFelt,
        tokenSymbolFelt,
        fiatAmountU256.low,
        fiatAmountU256.high,
        amountU256.low,
        amountU256.high,
        fee,
      ],
    };

    try {
      const account = getDeployerWallet();

      const txResponse = await account.execute(swapCall);

      return {
        txHash: txResponse.transaction_hash,
        status: 'pending',
        details: {
          from: fiatSymbol,
          to: tokenSymbol,
          amount: fiatAmount,
        },
      };
    } catch (error) {
      this.logger.error(`Swap failed ${fiatSymbol}->${tokenSymbol}: ${error.message}`, error.stack);
      throw new Error(`Swap failed: ${error.message}`);
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
    const token = tokenSymbol.toUpperCase();
    
    // The new contract expects token_symbol as felt252 (shortString encoded)
    const fiatSymbolFelt = shortString.encodeShortString(fiatSymbol);
    const tokenSymbolFelt = shortString.encodeShortString(token);
    
    const supportedTokenAddress = await this.getSupportedTokenBySymbol(token);
    const decimals = await this.getTokenDecimals(supportedTokenAddress);

    // Convert token amount to wei units properly handling decimals
    const amountInWei = convertToWei(tokenAmount, decimals);
    const amountU256 = uint256.bnToUint256(amountInWei);

    // try {
    //   const feeBpsResult = await this.getFeeBPS();
    //   const feeBps = BigInt(feeBpsResult);
    //   const fee = (BigInt(tokenAmount) * feeBps) / 10000n;
    //   const amountAfterFee = BigInt(tokenAmount) - fee;

    //   const pricePerToken = await this.getTokenAmountInUsd(
    //     supportedTokenAddress,
    //   );

    //   const decimals = await this.getTokenDecimals(supportedTokenAddress);
    //   const decimalsPower = BigInt(Math.pow(10, decimals));
    //   const calculatedFiatAmount =
    //     BigInt(amountAfterFee * BigInt(pricePerToken)) / decimalsPower;

    //   const availableFiat = await this.getFiatLiquidityBalance(fiat);

    //   if (availableFiat < calculatedFiatAmount) {
    //     throw new Error(
    //       `Insufficient fiat liquidity. Available: ${availableFiat}, Required: ${calculatedFiatAmount}`,
    //     );
    //   }
    // } catch (error) {
    //   throw new Error(`Pre-swap validation failed: ${error.message}`);
    // }

    const swapCall = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'swap_token_to_fiat',
      calldata: [
        userContractAddress,
        swapOrderIdToFelt,
        fiatSymbolFelt,
        tokenSymbolFelt,
        amountU256.low,
        amountU256.high,
        '0x0', // min_fiat_amount - should be calculated based on slippage tolerance
        '0x0',
      ],
    };

    try {
      // const account = getDeployerWallet();
      const tokenAddress =
        this.tokenContractService.getTokenAddress(tokenSymbol);
      if (!tokenAddress) throw new Error(`Token ${tokenSymbol} not supported`);
      await this.tokenContractService.approveTokenWithUserCredentials(
        user.id,
        tokenAddress,
        this.liquidityContractAddress,
        amountU256,
      );

      // const txResponse = await account.execute(swapCall);

      const txResponse = await this.keyManagementService.executeTransaction(
        user.id,
        [swapCall],
      );

      return {
        txHash: txResponse.transactionHash,
        status: 'pending',
        details: {
          from: token,
          to: fiatSymbol,
          amount: tokenAmount,
        },
      };
    } catch (error) {
      this.logger.error(`Swap failed ${token}->${fiatSymbol}: ${error.message}`, error.stack);
      throw new Error(`Swap failed: ${error.message}`);
    }
  }

  async getFeeBPS() {
    const cacheKey = 'liquidity:fee:bps';
    const cachedFee = await this.cacheManager.get(cacheKey);
    if (cachedFee) {
      this.logger.debug('Cache hit: Fee BPS');
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

    await this.cacheManager.set(cacheKey, feeBps.toString(), 300000);

    return feeBps;
  }

  /**
   * Get token balance from liquidity pool (replaces get_fiat_balance)
   * Use getTokenBalance instead - the new contract doesn't distinguish between fiat and token balances
   */
  async getFiatLiquidityBalance(fiatSymbol: string) {
    // For backward compatibility, try to get token address by symbol first
    // If fiatSymbol is actually a token symbol, use getTokenBalance
    const tokenAddress = await this.getTokenAddressBySymbol(fiatSymbol);
    if (tokenAddress) {
      return this.getTokenBalance(tokenAddress);
    }
    
    // If not found, return 0 (fiat balances are now tracked as token balances)
    this.logger.warn(`Token not found for symbol ${fiatSymbol}, returning 0`);
    return BigInt(0);
  }

  /**
   * Get token address by symbol from the contract
   */
  private async getTokenAddressBySymbol(symbol: string): Promise<string | null> {
    try {
      const symbolFelt = shortString.encodeShortString(symbol);
      const liquidityClass = await getClassAt(this.liquidityContractAddress);
      const liquidityContract = createNewContractInstance(
        liquidityClass.abi,
        this.liquidityContractAddress,
      );
      
      // The new contract uses token_by_symbol map
      // We need to read from storage or use a view function if available
      // For now, return null and let caller handle it
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get token balance from liquidity pool with caching
   * Updated to use token address instead of symbol
   */
  async getTokenBalance(tokenAddressOrSymbol: string): Promise<bigint> {
    // If it's a symbol, try to get the address first
    let tokenAddress = tokenAddressOrSymbol;
    if (!tokenAddressOrSymbol.startsWith('0x')) {
      // It's a symbol, get the address
      tokenAddress = await this.getSupportedTokenBySymbol(tokenAddressOrSymbol);
    }

    const cacheKey = `liquidity:token:balance:${tokenAddress}`;
    const cachedBalance = await this.cacheManager.get(cacheKey);
    if (cachedBalance) {
      this.logger.debug(`Cache hit: Token balance for ${tokenAddress}`);
      return BigInt(cachedBalance as string);
    }

    const liquidityClass = await getClassAt(this.liquidityContractAddress);
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result = await liquidityContract.get_token_balance(tokenAddress);
    const balance = BigInt(result);

    // Cache for 30 seconds
    await this.cacheManager.set(cacheKey, balance.toString(), 30000);

    return balance;
  }

  /**
   * Get token address by symbol (replaces get_supported_tokens_by_symbol)
   * The new contract uses token_by_symbol storage map
   * Note: This requires reading from storage directly or using a view function
   */
  async getSupportedTokenBySymbol(symbol: string) {
    const cacheKey = `liquidity:token:${symbol}`;
    const cachedToken = await this.cacheManager.get<string>(cacheKey);
    if (cachedToken) {
      this.logger.debug(`Cache hit: Token address for ${symbol}`);
      return cachedToken;
    }

    try {
      const liquidityClass = await getClassAt(this.liquidityContractAddress);
      const liquidityContract = createNewContractInstance(
        liquidityClass.abi,
        this.liquidityContractAddress,
      );

      const symbolFelt = shortString.encodeShortString(symbol);
      
      // The new contract stores token_by_symbol as a storage map
      // We need to read it directly from storage
      // For now, try to get token info which might help us find the address
      // This is a workaround - ideally the contract should have a view function
      
      // Try reading from storage slot (this is contract-specific and may need adjustment)
      // Storage slot calculation: token_by_symbol map at slot determined by Cairo storage layout
      // Note: Cairo storage uses pedersen hash, not keccak
      // For now, we'll need to use a view function or read from contract storage directly
      // This is a placeholder - the contract should expose a view function for this
      throw new Error(`Token ${symbol} lookup requires contract view function - not implemented via storage read`);
    } catch (error) {
      this.logger.error(`Error getting token address for ${symbol}: ${error.message}`, error.stack);
      throw new Error(`Token ${symbol} not found: ${error.message}`);
    }
  }

  /**
   * Transfer liquidity ownership
   * Note: The new contract uses AccessControl, so ownership is managed via roles
   * Use grant_role/revoke_role instead of transfer_ownership
   */
  async transferLiquidityOwnership(newOwnerAddress: string) {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');
    if (!newOwnerAddress) throw new Error('newOwnerAddress is required');

    try {
      this.logger.log(
        `Granting admin role to ${newOwnerAddress} on liquidity contract ${this.liquidityContractAddress}`,
      );

      // The new contract uses AccessControl with DEFAULT_ADMIN_ROLE = 0
      const DEFAULT_ADMIN_ROLE = '0x0';
      
      const call = {
        contractAddress: this.liquidityContractAddress,
        entrypoint: 'grant_role',
        calldata: [DEFAULT_ADMIN_ROLE, newOwnerAddress],
      };

      const account = getDeployerWallet();

      this.logger.log('Executing role grant transaction...');

      const { transaction_hash: txH } = await account.execute(call, {
        version: 3,
        maxFee: 10 ** 15,
        feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
        tip: 10 ** 13,
        paymasterData: [],
      });

      this.logger.log(`Transaction hash: ${txH}`);
      this.logger.log('Waiting for transaction confirmation...');
      const txR = await this.provider.waitForTransaction(txH);

      if (txR.isSuccess()) {
        this.logger.log(`Successfully granted admin role to ${newOwnerAddress}`);
        return {
          transactionHash: txH,
          receipt: txR,
        };
      } else {
        throw new Error('Role grant transaction failed');
      }
    } catch (error) {
      this.logger.error(`Failed to grant admin role: ${error.message}`, error.stack);
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

    const account = getDeployerWallet();

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

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Pragma oracle address updated. Transaction: ${txH}`);
    }
  }

  /**
   * Set liquidity contract address
   */
  setLiquidityContractAddress(address: string) {
    this.liquidityContractAddress = address;
  }

  private async invalidateUserRegistrationCache(userContractAddress: string) {
    await this.cacheManager.del(`liquidity:registered:${userContractAddress}`);
  }
}
