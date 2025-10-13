/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import {
  Account,
  RPC,
  ec,
  RpcProvider,
  stark,
  CallData,
  hash,
  LibraryError,
  uint256,
  BigNumberish,
  shortString,
} from 'starknet';
import 'dotenv/config';
import {
  connectToStarknet,
  createKeyPair,
  createNewContractInstance,
  deployAccount,
  encryptPrivateKey,
  getClassAt,
  getDeployerWallet,
  uuidToFelt252,
  writeAbiToFile,
} from './utils';
import erc20 from './abi/erc20.json';
import chalk from 'chalk';
import { log } from 'console';
import { KeyManagementService } from '../wallet/key-management.service';
import { UserService } from 'src/user/user.service';

@Injectable()
export class ContractService {
  private provider: RpcProvider;
  private liquidityContractAddress: string;
  private accountAddress: string;
  private accountFactoryAddress: string;
  private accountContractHash: string;
  private syncTokenAddress: string;
  private strkTokenAddress: string;
  private usdcTokenAddress: string;
  private usdtTokenAddress: string;
  private ethTokenAddress: string;
  private btcTokenAddress: string;

  private private_key: string;

  constructor(
    private readonly keyManagementService: KeyManagementService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {
    this.provider = connectToStarknet();
    this.liquidityContractAddress =
      process.env.LIQUIDITY_CONTRACT_ADDRESS || '';
    this.accountAddress = process.env.DEPLOYER_ADDRESS || '';
    this.accountFactoryAddress = process.env.ACCOUNT_FACTORY_ADDRESS || '';
    this.accountContractHash = process.env.ACCOUNT_CONTRACT_HASH || '';
    this.syncTokenAddress = process.env.SYNC_TOKEN_ADDRESS || '';
    this.strkTokenAddress = process.env.STRK_TOKEN_ADDRESS || '';
    this.usdcTokenAddress = process.env.USDC_TOKEN_ADDRESS || '';
    this.usdtTokenAddress = process.env.USDT_TOKEN_ADDRESS || '';
    this.ethTokenAddress = process.env.ETH_TOKEN_ADDRESS || '';
    this.btcTokenAddress = process.env.BTC_TOKEN_ADDRESS || '';

    this.private_key = process.env.DEPLOYER_PRIVATE_KEY || '';
  }

  createAccount = async (user_unique_id: string) => {
    if (!user_unique_id) throw new Error('user unique id is required');
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');

    const userFelt252Id = uuidToFelt252(user_unique_id);

    try {
      const accountFactoryClass = await this.provider.getClassAt(
        this.accountFactoryAddress,
      );

      await writeAbiToFile(accountFactoryClass, 'accountFactoryAbi');

      const { privateKey, publicKey } = createKeyPair();

      const encryptedPrivateKey = encryptPrivateKey(privateKey);

      const call = {
        contractAddress: this.accountFactoryAddress,
        entrypoint: 'create_account',
        calldata: [publicKey, userFelt252Id],
      };

      const account = this.getDeployerWallet();

      log("account:", account);

      const { transaction_hash: txH } = await account.execute(call, {
        maxFee: 10 ** 15,
      });

      const txR = await this.provider.waitForTransaction(txH);
      log(txR);
      if (txR.isSuccess()) {
        // Parse the account creation event
        const events = txR.value.events;
        const accountCreatedEvent = events?.find(
          (event) =>
            event.keys[0] ===
            '0x1d9ca8a89626bead91b5cb4275a622219e9443975b34f3fdbc683e8621231a9',
        );

        if (!accountCreatedEvent) {
          throw new Error(
            'Account creation event not found in transaction receipt',
          );
        }

        // The account address is in the second position of the data array
        const accountAddress = accountCreatedEvent.data[1];

        return {
          transactionHash: txH,
          accountAddress,
          encryptedPrivateKey,
          receipt: txR,
        };
      }
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  };

  registerUserToLiquidity = async (
    userContractAddress: string,
    fiatAccountId: string,
  ) => {
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
      }
      return "success";
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  };

  addFiatToLiquidity = async (
    symbol: string,
    amount: string,
  ) => {
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
      calldata: [symbolFelt, amountU256.low,
        amountU256.high],
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
  };

  addTokenToLiquidity = async (
    symbol: string,
    amount: string,
  ) => {
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
      calldata: [symbolFelt, amountU256.low,
        amountU256.high],
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
  };

  isUserRegistered = async (userContractAddress: string) => {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');

    if (!userContractAddress) throw new Error('user address is required');

    const liquidityClass = await getClassAt(this.liquidityContractAddress);

    await writeAbiToFile(liquidityClass, 'liquidityAbi');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result =
      await liquidityContract.is_user_registered(userContractAddress);
    return result;
  };

  addSupportedToken = async (symbol: string, address: string) => {
    if (!symbol) throw new Error('symbol is required');
    if (!address) throw new Error('address is required');

    const symbolFelt = shortString.encodeShortString(symbol);

    // const liquidityClass = await getClassAt(this.liquidityContractAddress);

    // await writeAbiToFile(liquidityClass, 'liquidityAbi');

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
    }
  };

  computeAddress = () => {
    // new Open Zeppelin account v0.8.1
    // Generate public and private key pair.
    const privateKey = stark.randomAddress();
    const starkKeyPub = ec.starkCurve.getStarkKey(privateKey);

    const OZaccountClassHash = this.accountContractHash;
    // Calculate future address of the account
    const OZaccountConstructorCallData = CallData.compile({
      publicKey: starkKeyPub,
    });
    const OZcontractAddress = hash.calculateContractAddressFromHash(
      starkKeyPub,
      OZaccountClassHash,
      OZaccountConstructorCallData,
      0,
    );
    return OZcontractAddress;
  };

  accountDeployment = async () => {
    try {
      console.log('Deploying account contract...');

      await deployAccount();

      console.log(
        chalk.green(
          `Account contract successfully deployed to Starknet testnet`,
        ),
      );
    } catch (error) {
      if (
        error instanceof LibraryError &&
        error.message.includes('balance is smaller')
      ) {
        console.log(chalk.red('Insufficient account balance for deployment'));
        process.exit(1);
      } else {
        console.log(chalk.red('Deploy account transaction failed'));
        process.exit(1);
      }
    }
  };

  getDeployerWallet = () => {
    if (!this.provider || !this.accountAddress || !this.private_key) throw new Error("credentials required to deploy deployer's wallet");
    return new Account(this.provider, this.accountAddress, this.private_key);
  };

  getAccountAddress = async (userAddress: string) => {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');

    if (!userAddress) throw new Error('user address is required');

    const AccountClass = await getClassAt(this.accountFactoryAddress);

    await writeAbiToFile(AccountClass, 'accountFactoryAbi');

    try {
      const accountContract = createNewContractInstance(
        AccountClass.abi,
        this.accountFactoryAddress,
      );

      const result = await accountContract.get_account(userAddress);
      const feltValue = Array.isArray(result) ? result[0] : result;

      // Convert decimal string to hex
      const hexValue = '0x' + BigInt(feltValue as string).toString(16);
      return hexValue;
    } catch (error) {
      console.log(error);
      throw error;
    }
  };

  setLiquidityContractAddress = (address: string) => {
    this.liquidityContractAddress = address;
  };

  getUserDashboardData = async (userAddress: string) => {
    if (!userAddress) throw new Error('user address is required');

    const userFelt252Id = uuidToFelt252(userAddress);

    try {
      const accountAddress = await this.getAccountAddress(userFelt252Id);

      console.log("accountAddress", accountAddress);

      const isRegistered = await this.isUserRegistered(accountAddress);
      console.log("isRegistered", isRegistered);

      const dashboardData = {
        isRegistered,
        accountAddress: accountAddress?.toString() || null,
      };

      return dashboardData;
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw new Error('Failed to fetch dashboard data');
    }
  };

  getAccountBalance = async (symbol: string, userAddress: string) => {
    if (!symbol) throw new Error('symbol is required');
    if (!userAddress) throw new Error('userAddress is required');

    // Map symbols to their contract addresses on Starknet
    const tokenAddressMap: { [key: string]: string } = {
      SYNC: this.syncTokenAddress,
      STRK: this.strkTokenAddress,
      USDC: this.usdcTokenAddress,
      USDT: this.usdtTokenAddress,
      ETH: this.ethTokenAddress,
      BTC: this.btcTokenAddress,
    };

    const tokenAddress = tokenAddressMap[symbol.toUpperCase()];
    if (!tokenAddress) {
      throw new Error(`Token with symbol ${symbol} not supported`);
    }

    // Different tokens have different decimal places
    const decimalsMap: { [key: string]: number } = {
      SYNC: 18,
      STRK: 18,
      USDC: 6,
      USDT: 6,
      ETH: 18,
      BTC: 18,
    };

    try {
      const tokenContract = createNewContractInstance(erc20, tokenAddress);

      const balance = await tokenContract.balance_of(userAddress);
      const decimals = decimalsMap[symbol.toUpperCase()] || 18;

      // Convert from smallest unit to human-readable format
      const balanceFormatted = Number(balance) / Math.pow(10, decimals);

      return {
        raw: balance.toString(),
        formatted: balanceFormatted.toString(),
        symbol: symbol.toUpperCase(),
        decimals: decimals,
      };
    } catch (error) {
      console.error(
        `Error fetching balance for ${symbol} for account ${userAddress}:`,
        error,
      );
      throw error;
    }
  };

  // Set account class hash in account factory
  setAccountClassHash = async (classHash: string) => {
    if (!classHash) throw new Error('class hash is required');
    this.accountContractHash = classHash;

    const call = {
      contractAddress: this.accountFactoryAddress,
      entrypoint: 'set_account_class_hash',
      calldata: [classHash],
    };

    const account = this.getDeployerWallet();

    await account.execute(call);

    console.log('Account class hash set successfully');
  };

  getAccountClassHash = async () => {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');
    const accountFactoryClass = await this.provider.getClassAt(
      this.accountFactoryAddress,
    );
    if (!accountFactoryClass.abi)
      throw new Error('No ABI found for account factory contract');
    const accountFactoryContract = createNewContractInstance(
      accountFactoryClass.abi,
      this.accountFactoryAddress,
    );
    const result = await accountFactoryContract.get_account_class_hash();
    // result is probably { account_class_hash: string } or just a felt
    const feltValue = Array.isArray(result) ? result[0] : result;

    // Convert decimal string to hex
    const hexValue = '0x' + BigInt(feltValue as string).toString(16);

    return hexValue;
  };

  transferFactoryOwnership = async (newOwnerAddress: string) => {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');
    if (!newOwnerAddress) throw new Error('newOwnerAddress is required');

    try {
      const call = {
        contractAddress: this.accountFactoryAddress,
        entrypoint: 'transfer_ownership',
        calldata: [newOwnerAddress],
      };

      const account = this.getDeployerWallet();

      const { transaction_hash: txH } = await account.execute(call, {
        maxFee: 10 ** 15,
      });

      const txR = await this.provider.waitForTransaction(txH);

      if (txR.isSuccess()) {
        console.log(`Successfully transferred ownership to ${newOwnerAddress}`);
        return {
          transactionHash: txH,
          receipt: txR,
        };
      } else {
        throw new Error('Ownership transfer transaction failed');
      }
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  };

  transferLiquidityOwnership = async (newOwnerAddress: string) => {
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

      const account = this.getDeployerWallet(); // This must be the current owner

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
  };

  getTokenAmountInUsd = async (address: string) => {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');
    if (!address) throw new Error('address is required');

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

    // const amountInUsd = (Number(pricePerToken) / 1_000_000);
    // const amountInUsd = Math.floor((Number(pricePerToken) / 1_000_000) * 1000) / 1000;

    // return amountInUsd;
    return pricePerToken;

  };

  swapFiatToToken = async (
    userContractAddress: string,
    fiatSymbol: string,
    tokenSymbol: string,
    fiatAmount: number,
    swapOrderId: string,
  ) => {
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
        // version: 3,
        maxFee: 10 ** 15,
        // feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
        // tip: 10 ** 13,
        // paymasterData: [],
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
  };

  /**
   * Swap token to fiat using user's credentials
   * This method uses the user's private key to sign the transaction
   * The user must have previously approved the liquidity contract to spend their tokens
   *
   * @param userId - The user's ID
   * @param fiatSymbol - Fiat currency symbol (e.g., 'NGN')
   * @param tokenSymbol - Token symbol (e.g., 'STRK', 'USDC')
   * @param tokenAmount - Amount of tokens to swap (human-readable)
   * @returns Transaction hash and details
   */
  swapTokenToFiat = async (
    userContractAddress: string,
    fiatSymbol: string,
    tokenSymbol: string,
    tokenAmount: string,
    swapOrderId: string,
  ) => {
    if (!userContractAddress)
      throw new Error('userContractAddress is required');
    if (!fiatSymbol) throw new Error('fiatSymbol is required');
    if (!tokenSymbol) throw new Error('tokenSymbol is required');
    if (!tokenAmount) throw new Error('tokenAmount is required');
    const user = await this.userService.getUserByCryptoAddress(userContractAddress);
    if (!user) throw new Error('User not found');

    const swapOrderIdToFelt = uuidToFelt252(swapOrderId);

    const fiat = "USD";
    const token = tokenSymbol.toUpperCase();

    // Token address mapping
    const tokenAddressMap: Record<string, string> = {
      SYNC: this.syncTokenAddress,
      STRK: this.strkTokenAddress,
      USDC: this.usdcTokenAddress,
      USDT: this.usdtTokenAddress,
      ETH: this.ethTokenAddress,
      BTC: this.btcTokenAddress,
    };

    const tokenAddress = tokenAddressMap[token];
    if (!tokenAddress)
      throw new Error(`Token ${token} not supported for swap.`);

    // Token decimals mapping
    const decimalsMap: Record<string, number> = {
      SYNC: 18,
      STRK: 18,
      USDC: 6,
      USDT: 6,
      ETH: 18,
      BTC: 18,
    };

    const decimals = decimalsMap[token] || 18;

    // Convert tokenAmount (human-readable) to smallest unit
    // const adjustedAmount = BigInt(Math.floor(Number(tokenAmount) * Math.pow(10, decimals)));
    const amountU256 = uint256.bnToUint256(BigInt(tokenAmount));
    const tokenSymbolToUSD = `${token}/USD`;
    const supportedTokenAddress = await this.getSupportedTokenBySymbol(tokenSymbolToUSD);

    try {
      const feeBpsResult = await this.getFeeBPS();
      const feeBps = BigInt(feeBpsResult);
      // Calculate token amount after fee
      const fee = (BigInt(tokenAmount) * feeBps) / 10000n;
      const amountAfterFee = BigInt(tokenAmount) - fee;

      const pricePerToken = await this.getTokenAmountInUsd(supportedTokenAddress);

      // Calculate expected fiat amount using same formula as contract
      const decimalsPower = BigInt(Math.pow(10, (decimals)));
      const calculatedFiatAmount = BigInt(amountAfterFee * BigInt(pricePerToken)) / decimalsPower;

      const availableFiat = await this.getFiatLiquidityBalance(fiat);

      if (availableFiat < calculatedFiatAmount) {
        throw new Error(
          `Insufficient fiat liquidity. Available: ${availableFiat}, Required: ${calculatedFiatAmount}`
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
  };

  /**
   * Execute a transaction using user's credentials (private key)
   * This allows users to sign their own transactions for token approvals and swaps
   * 
   * @param userId - The user's ID
   * @param calls - Array of contract calls to execute
   * @returns Transaction hash and receipt
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

  approveTokenWithUserCredentials = async (
    userId: string,
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint
  ) => {
    const call = {
      contractAddress: tokenAddress,
      entrypoint: 'approve',
      calldata: CallData.compile({
        spender: spenderAddress,
        amount: { low: amount & BigInt('0xFFFFFFFFFFFFFFFF'), high: amount >> BigInt(128) }
      })
    };

    const result = await this.executeUserTransaction(userId, [call]);
    return result;
  }

  approveTokenWithDeployerCredentials = async (
    tokenAddress: string,
    spenderAddress: string,
    amount: bigint
  ) => {
    const account = this.getDeployerWallet();

    const call = {
      contractAddress: tokenAddress,
      entrypoint: 'approve',
      calldata: CallData.compile({
        spender: spenderAddress,
        amount: { low: amount & BigInt('0xFFFFFFFFFFFFFFFF'), high: amount >> BigInt(128) }
      })
    };

    const result = await account.execute(call);
    await this.provider.waitForTransaction(result.transaction_hash);

    return result;
  }


  mintToken = async (receiverAddress: string, amount: string) => {
    if (!receiverAddress) throw new Error('receiverAddress is required');
    if (!amount) throw new Error('amount is required');

    const call = {
      contractAddress: this.syncTokenAddress,
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
  };

  upgradeAccountFactory = async (classHash: string) => {
    if (!classHash) throw new Error('class hash is required');
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');

    if (!this.private_key || !this.accountAddress)
      throw new Error('account credentials required');

    const accountFactoryClass = await this.provider.getClassAt(
      this.accountFactoryAddress,
    );
    if (!accountFactoryClass.abi)
      throw new Error('No ABI found for account factory contract');

    const call = {
      contractAddress: this.accountFactoryAddress,
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
  };

  upgradePragmaOracleAddress = async (contractAddress: string) => {
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
  };

  getApproveTokenCalldata = (
    tokenSymbol: string,
    spenderAddress: string,
    amount: string,
  ) => {
    const token = tokenSymbol.toUpperCase();

    const tokenAddressMap: Record<string, string> = {
      SYNC: this.syncTokenAddress,
      STRK: this.strkTokenAddress,
      USDC: this.usdcTokenAddress,
      USDT: this.usdtTokenAddress,
      ETH: this.ethTokenAddress,
      BTC: this.btcTokenAddress,
    };

    const tokenAddress = tokenAddressMap[token];
    if (!tokenAddress) {
      throw new Error(`Token ${token} not supported`);
    }

    const decimalsMap: Record<string, number> = {
      SYNC: 18,
      STRK: 18,
      USDC: 6,
      USDT: 6,
      ETH: 18,
      BTC: 18,
    };

    const decimals = decimalsMap[token] || 18;
    const adjustedAmount = BigInt(Math.floor(Number(amount) * Math.pow(10, decimals)));
    const amountU256 = uint256.bnToUint256(adjustedAmount);

    return {
      contractAddress: tokenAddress,
      entrypoint: 'approve',
      calldata: [
        spenderAddress,
        amountU256.low,
        amountU256.high,
      ],
    };
  };

  upgradeLiquidityContract = async (classHash: string) => {
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
  };

  getFeeBPS = async () => {
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
    return BigInt(result);
  };

  getFiatLiquidityBalance = async (fiatSymbol: string) => {
    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result = await liquidityContract.get_fiat_balance(
      fiatSymbol,
    );
    return BigInt(result);
  };

  getSupportedTokenBySymbol = async (symbol: string) => {
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

    const result = await liquidityContract.get_supported_tokens_by_symbol(
      symbolFelt,
    );
    return result;
  };

  getTokenDecimals = async (tokenAddress: string) => {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');

    const AccountClass = await getClassAt(this.accountFactoryAddress);

    try {
      const accountContract = createNewContractInstance(
        AccountClass.abi,
        this.accountFactoryAddress,
      );

      // const result = await accountContract.decimals(tokenAddress);
      return 18;
    } catch (error) {
      console.log(error);
      throw error;
    }
  };
}
