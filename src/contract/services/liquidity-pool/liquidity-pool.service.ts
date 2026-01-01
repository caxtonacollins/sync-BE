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
} from '../../helpers/utils.helper';
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
   * Add token liquidity to the pool
   * @param tokenAddress The address of the token to add liquidity for
   * @param amount The amount of tokens to add (in wei)
   * @param minLiquidity The minimum amount of liquidity tokens to receive (in wei)
   */
  async addTokenLiquidity(
    tokenAddress: string, 
    amount: string, 
    minLiquidity: string = '0'
  ) {
    if (!tokenAddress) throw new Error('tokenAddress is required');
    if (!amount) throw new Error('amount is required');

    const amountU256 = uint256.bnToUint256(BigInt(amount));
    const minLiquidityU256 = uint256.bnToUint256(BigInt(minLiquidity));

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'add_liquidity',
      calldata: [
        tokenAddress,
        amountU256.low,
        amountU256.high,
        minLiquidityU256.low,
        minLiquidityU256.high
      ],
    };

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Token liquidity added. Transaction: ${txH}`);
      // Invalidate token balance cache
      await this.cacheManager.del(`liquidity:token:balance:${tokenAddress}`);
      return txH;
    }
    
    throw new Error('Failed to add liquidity');
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
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Token liquidity added. Transaction: ${txH}`);
    }
  }

  /**
   * Add a new token to the liquidity bridge
   * @param tokenAddress The address of the token contract
   * @param symbol The token symbol (e.g., 'USDC')
   * @param feedId The Pragma feed ID for price oracles (as felt252)
   * @param decimals Number of decimals for the token
   * @param minAmount Minimum amount for swaps (in wei)
   * @param maxAmount Maximum amount for swaps (in wei)
   * @param isActive Whether the token is active for trading
   */
  async addSupportedToken(
    tokenAddress: string,
    symbol: string,
    feedId: string = '0x0',
    decimals: number = 18,
    minAmount: string = '0',
    maxAmount: string = '0',
    isActive: boolean = true,
  ) {
    if (!symbol) throw new Error('symbol is required');
    if (!tokenAddress) throw new Error('tokenAddress is required');

    const symbolFelt = shortString.encodeShortString(symbol);
    const feedIdFelt = feedId.startsWith('0x') ? feedId : `0x${feedId}`;
    const minAmountU256 = uint256.bnToUint256(BigInt(minAmount));
    const maxAmountU256 = uint256.bnToUint256(BigInt(maxAmount));

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'add_token',
      calldata: [
        tokenAddress,
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
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Token ${symbol} (${tokenAddress}) added successfully. Transaction: ${txH}`);
      // Invalidate supported token cache
      await this.cacheManager.del(`liquidity:token:${symbol}`);
      return txH;
    }
    
    throw new Error('Failed to add token');
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
   * @param userContractAddress The user's contract address
   * @param swapOrderId Unique swap order ID (will be converted to felt252)
   * @param fiatSymbol Fiat currency symbol (e.g., 'USD')
   * @param tokenSymbol Token symbol to receive (e.g., 'USDC')
   * @param fiatAmount Fiat amount in smallest unit (e.g., cents for USD)
   * @param tokenAmount Expected token amount in wei
   * @param fee Fee amount in wei
   */
  async swapFiatToToken(
    userContractAddress: string,
    swapOrderId: string,
    fiatSymbol: string,
    tokenSymbol: string,
    fiatAmount: string,
    tokenAmount: string,
    fee: string,
  ) {
    if (!userContractAddress) throw new Error('userContractAddress is required');
    if (!swapOrderId) throw new Error('swapOrderId is required');
    if (!fiatSymbol) throw new Error('fiatSymbol is required');
    if (!tokenSymbol) throw new Error('tokenSymbol is required');
    if (!fiatAmount) throw new Error('fiatAmount is required');
    if (!tokenAmount) throw new Error('tokenAmount is required');
    if (fee === undefined) throw new Error('fee is required');

    const user = await this.userService.getUserByCryptoAddress(userContractAddress);
    if (!user) throw new Error('User not found');

    const swapOrderIdFelt = uuidToFelt252(swapOrderId);
    const fiatSymbolFelt = shortString.encodeShortString(fiatSymbol);
    const tokenSymbolFelt = shortString.encodeShortString(tokenSymbol);
    
    const fiatAmountU256 = uint256.bnToUint256(BigInt(fiatAmount));
    const tokenAmountU256 = uint256.bnToUint256(BigInt(tokenAmount));
    const feeU128 = BigInt(fee);

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'swap_fiat_to_token',
      calldata: [
        userContractAddress,
        swapOrderIdFelt,
        fiatSymbolFelt,
        tokenSymbolFelt,
        fiatAmountU256.low,
        fiatAmountU256.high,
        tokenAmountU256.low,
        tokenAmountU256.high,
        feeU128,
      ],
    };

    try {
      const account = getDeployerWallet();
      const { transaction_hash: txHash } = await account.execute(call, {
        version: 3,
        tip: 10 ** 13,
        paymasterData: [],
      });

      this.logger.log(`Fiat to token swap initiated. Transaction: ${txHash}`);
      
      return {
        txHash,
        status: 'pending',
        details: {
          from: fiatSymbol,
          to: tokenSymbol,
          amount: fiatAmount,
          fee: fee.toString(),
        },
      };
    } catch (error) {
      this.logger.error(`Fiat to token swap failed: ${error.message}`, error.stack);
      throw new Error(`Fiat to token swap failed: ${error.message}`);
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
        userContractAddress,
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
   * @param tokenAddressOrSymbol Token address or symbol
   * @returns Token balance in wei
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
    if (!liquidityClass.abi) {
      throw new Error('No ABI found for liquidity contract');
    }

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    try {
      // First try the new contract's get_token_balance function
      const result = await liquidityContract.get_token_balance(tokenAddress);
      const balance = BigInt(result);

      // Cache for 30 seconds
      await this.cacheManager.set(cacheKey, balance.toString(), 30000);
      return balance;
    } catch (error) {
      // Fallback to reading from storage if the function doesn't exist
      this.logger.warn(`get_token_balance failed, falling back to storage read: ${error.message}`);
      throw new Error('Failed to get token balance: ' + error.message);
    }
  }

  /**
   * Remove liquidity from the pool
   * @param tokenAddress The address of the token to remove liquidity from
   * @param liquidity The amount of liquidity tokens to burn
   * @param minAmount The minimum amount of tokens to receive (slippage protection)
   */
  async removeLiquidity(
    tokenAddress: string,
    liquidity: string,
    minAmount: string = '0'
  ) {
    if (!tokenAddress) throw new Error('tokenAddress is required');
    if (!liquidity) throw new Error('liquidity amount is required');

    const liquidityU256 = uint256.bnToUint256(BigInt(liquidity));
    const minAmountU256 = uint256.bnToUint256(BigInt(minAmount));

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi) {
      throw new Error('No ABI found for liquidity contract');
    }

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'remove_liquidity',
      calldata: [
        tokenAddress,
        liquidityU256.low,
        liquidityU256.high,
        minAmountU256.low,
        minAmountU256.high,
      ],
    };

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Liquidity removed. Transaction: ${txH}`);
      // Invalidate token balance cache
      await this.cacheManager.del(`liquidity:token:balance:${tokenAddress}`);
      return txH;
    }
    
    throw new Error('Failed to remove liquidity');
  }

  /**
   * Get pool information for a token
   * @param tokenAddress The address of the token
   */
  async getPoolInfo(tokenAddress: string) {
    if (!tokenAddress) throw new Error('tokenAddress is required');

    const liquidityClass = await getClassAt(this.liquidityContractAddress);
    if (!liquidityClass.abi) {
      throw new Error('No ABI found for liquidity contract');
    }

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    try {
      return await liquidityContract.get_pool_info(tokenAddress);
    } catch (error) {
      this.logger.error(`Failed to get pool info: ${error.message}`, error.stack);
      throw new Error(`Failed to get pool info: ${error.message}`);
    }
  }

  /**
   * Get token information
   * @param tokenAddress The address of the token
   */
  async getTokenInfo(tokenAddress: string) {
    if (!tokenAddress) throw new Error('tokenAddress is required');

    const liquidityClass = await getClassAt(this.liquidityContractAddress);
    if (!liquidityClass.abi) {
      throw new Error('No ABI found for liquidity contract');
    }

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    try {
      return await liquidityContract.get_token_info(tokenAddress);
    } catch (error) {
      this.logger.error(`Failed to get token info: ${error.message}`, error.stack);
      throw new Error(`Failed to get token info: ${error.message}`);
    }
  }

  /**
   * Calculate the amount of output tokens for a given input amount
   * @param fromToken The address of the input token
   * @param toToken The address of the output token
   * @param fromAmount The amount of input tokens (in wei)
   */
  async calculateSwapAmount(
    fromToken: string,
    toToken: string,
    fromAmount: string
  ) {
    if (!fromToken) throw new Error('fromToken is required');
    if (!toToken) throw new Error('toToken is required');
    if (!fromAmount) throw new Error('fromAmount is required');

    const fromAmountU256 = uint256.bnToUint256(BigInt(fromAmount));

    const liquidityClass = await getClassAt(this.liquidityContractAddress);
    if (!liquidityClass.abi) {
      throw new Error('No ABI found for liquidity contract');
    }

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    try {
      const result = await liquidityContract.calculate_swap_amount(
        fromToken,
        toToken,
        fromAmountU256.low,
        fromAmountU256.high
      );
      
      return uint256.uint256ToBN({
        low: result.low,
        high: result.high,
      }).toString();
    } catch (error) {
      this.logger.error(`Failed to calculate swap amount: ${error.message}`, error.stack);
      throw new Error(`Failed to calculate swap amount: ${error.message}`);
    }
  }

  /**
   * Set the fee rate in basis points (1% = 100)
   * @param feeBps The fee rate in basis points (e.g., 10 for 0.1%)
   */
  async setFeeBps(feeBps: number) {
    if (feeBps < 0 || feeBps > 10000) {
      throw new Error('Fee must be between 0 and 10000 (100%)');
    }

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'set_fee_bps',
      calldata: [feeBps],
    };

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Fee set to ${feeBps} bps. Transaction: ${txH}`);
      // Invalidate fee cache
      await this.cacheManager.del('liquidity:fee:bps');
      return txH;
    }
    
    throw new Error('Failed to set fee');
  }

  /**
   * Withdraw collected fees
   * @param tokenAddress The address of the token to withdraw fees for
   * @param amount The amount to withdraw (in wei)
   */
  async withdrawFees(tokenAddress: string, amount: string) {
    if (!tokenAddress) throw new Error('tokenAddress is required');
    if (!amount) throw new Error('amount is required');

    const amountU256 = uint256.bnToUint256(BigInt(amount));

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'withdraw_fees',
      calldata: [tokenAddress, amountU256.low, amountU256.high],
    };

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      tip: 10 ** 13,
      paymasterData: [],
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      this.logger.log(`Withdrew ${amount} in fees. Transaction: ${txH}`);
      return txH;
    }
    
    throw new Error('Failed to withdraw fees');
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
