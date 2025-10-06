/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
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
  formatTokenAmount,
  getClassAt,
  getDeployerWallet,
  uuidToFelt252,
  writeAbiToFile,
} from './utils';
import erc20 from './abi/erc20.json';
import chalk from 'chalk';
import { log } from 'console';

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

  private private_key: string;

  constructor() {
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

    this.private_key = process.env.DEPLOYER_PRIVATE_KEY || '';
  }

  createAccount = async (user_unique_id: string) => {
    if (!user_unique_id) throw new Error('user unique id is required');
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');

    const user_felt252_id = uuidToFelt252(user_unique_id);

    try {
      const accountFactoryClass = await this.provider.getClassAt(
        this.accountFactoryAddress,
      );

      await writeAbiToFile(accountFactoryClass, 'accountFactoryAbi');

      const { publicKey } = createKeyPair();

      const call = {
        contractAddress: this.accountFactoryAddress,
        entrypoint: 'create_account',
        calldata: [publicKey, user_felt252_id],
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
      // resourceBounds: {
      //   l1_gas: {
      //     max_amount: num.toHex(this.maxQtyGasAuthorized),
      //     max_price_per_unit: num.toHex(this.maxPriceAuthorizeForOneGas),
      //   },
      //   l2_gas: {
      //     max_amount: num.toHex(0),
      //     max_price_per_unit: num.toHex(0),
      //   },
      // },
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
      return result;
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

    try {
      // Check if user is registered
      const isRegistered = await this.isUserRegistered(userAddress);

      // Get user account address from factory
      const accountAddress = await this.getAccountAddress(userAddress);

      // Get account nonce as a way to check if account exists and is active
      let nonce = '0';
      try {
        const nonceResponse = await this.provider.getNonceForAddress(
          accountAddress.toString() as BigNumberish,
        );
        nonce = nonceResponse.toString();
      } catch (error) {
        console.error('Error fetching nonce:', error);
      }

      // Get liquidity contract details if user is registered
      let liquidityDetails = null;
      if (isRegistered && this.liquidityContractAddress) {
        const liquidityClass = await getClassAt(this.liquidityContractAddress);
        const liquidityContract = createNewContractInstance(
          liquidityClass.abi,
          this.liquidityContractAddress,
        );

        // Get user's liquidity details
        try {
          liquidityDetails =
            await liquidityContract.get_user_details(userAddress);
        } catch (error) {
          console.error('Error fetching liquidity details:', error);
          liquidityDetails = null;
        }
      }

      const dashboardData = {
        isRegistered,
        accountAddress: accountAddress?.toString() || null,
        nonce,
        accountStatus: nonce !== '0' ? 'active' : 'pending',
        liquidityDetails,
        userAddress,
        timestamp: new Date().toISOString(),
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
    };

    const tokenAddress = tokenAddressMap[symbol.toUpperCase()];
    if (!tokenAddress) {
      throw new Error(`Token with symbol ${symbol} not supported`);
    }

    // Different tokens have different decimal places
    const decimalsMap: { [key: string]: number } = {
      SYNC: 18,
      STRK: 18,
      USDC: 6, // USDC has 6 decimals
      USDT: 6, // USDT has 6 decimals
      ETH: 18,
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

  getTokenAmountInUsd = async (address: string, amount: string) => {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');
    if (!address) throw new Error('address is required');
    if (!amount) throw new Error('amount is required');

    const liquidityClass = await getClassAt(this.liquidityContractAddress);

    await writeAbiToFile(liquidityClass, 'liquidityAbi');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result = await liquidityContract.get_token_amount_in_usd(
      address,
      uint256.bnToUint256(amount),
    );

    if (BigInt(result as bigint) < BigInt(1000)) {
      return formatTokenAmount(result as bigint, 3);
    } else return result;
  };

  swapFiatToToken = async (
    userContractAddress: string,
    fiatSymbol: string,
    tokenSymbol: string,
    fiatAmount: number,
  ) => {
    if (!userContractAddress)
      throw new Error('userContractAddress is required');
    if (!fiatSymbol) throw new Error('fiatSymbol is required');
    if (!tokenSymbol) throw new Error('tokenSymbol is required');
    if (!fiatAmount) throw new Error('fiatAmount is required');

    const fiatSymbolFelt = shortString.encodeShortString(fiatSymbol);
    const tokenSymbolFelt = shortString.encodeShortString(tokenSymbol);
    const amountU256 = uint256.bnToUint256(BigInt(fiatAmount));

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'swap_fiat_to_token',
      calldata: [
        userContractAddress,
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

  swapTokenToFiat = async (
    userContractAddress: string,
    fiatSymbol: string,
    tokenSymbol: string,
    tokenAmount: string,
  ) => {
    if (!userContractAddress)
      throw new Error('userContractAddress is required');
    if (!fiatSymbol) throw new Error('fiatSymbol is required');
    if (!tokenSymbol) throw new Error('tokenSymbol is required');
    if (!tokenAmount) throw new Error('tokenAmount is required');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'swap_token_to_fiat',
      calldata: [userContractAddress, fiatSymbol, tokenSymbol, tokenAmount],
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
            `Successfully swapped token to fiat for user ${userContractAddress}`,
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
}
