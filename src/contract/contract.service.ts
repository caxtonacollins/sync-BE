/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import {
  Account,
  num,
  RPC,
  ec,
  RpcProvider,
  stark,
  CallData,
  hash,
  LibraryError,
} from 'starknet';
import 'dotenv/config';
import {
  connectToStarknet,
  createKeyPair,
  createNewContractInstance,
  deployAccount,
  getClassAt,
  getDeployerWallet,
  uuidToFelt252,
  writeAbiToFile,
} from './utils';
import chalk from 'chalk';

@Injectable()
export class ContractService {
  private provider: RpcProvider;
  private liquidityContractAddress: string;
  private accountAddress: string;
  private accountFactoryAddress: string;
  private accountContractHash: string;

  private private_key: string;
  private maxQtyGasAuthorized: string;
  private maxPriceAuthorizeForOneGas: string;
  private deployerAccount: Account;

  constructor() {
    this.provider = connectToStarknet();
    this.liquidityContractAddress =
      process.env.LIQUIDITY_CONTRACT_ADDRESS || '';
    this.accountAddress = process.env.ACCOUNT_ADDRESS || '';
    this.accountFactoryAddress = process.env.ACCOUNT_FACTORY_ADDRESS || '';
    this.accountContractHash = process.env.ACCOUNT_CONTRACT_HASH || '';

    this.private_key = process.env.DEPLOYER_PRIVATE_KEY || '';
    this.maxQtyGasAuthorized = '2000';
    this.maxPriceAuthorizeForOneGas = '16283550959677';
    this.deployerAccount = getDeployerWallet();
  }

  createAccount = async (user_unique_id: string) => {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');
    if (!this.accountContractHash)
      throw new Error('ACCOUNT_CONTRACT_HASH env variable is not set');
    if (!this.private_key) throw new Error('private key is required');
    if (!user_unique_id) throw new Error('user unique id is required');

    const user_felt252_id = uuidToFelt252(user_unique_id);

    try {
      const accountFactoryClass = await this.provider.getClassAt(
        this.accountFactoryAddress,
      );

      await writeAbiToFile(accountFactoryClass, 'accountFactoryAbi');

      const { publicKey } = createKeyPair();

      console.log(
        `Creating account for user with ID: ${user_felt252_id} and public key: ${publicKey}`,
      );

      const call = {
        contractAddress: this.accountFactoryAddress,
        entrypoint: 'create_account',
        calldata: [publicKey, user_felt252_id],
      };

      const account = this.getDeployerWallet();

      console.log(chalk.blue('Executing account creation transaction...'));

      // Remove resourceBounds from transaction options for RPC v0.8 compatibility
      const { transaction_hash: txH } = await account.execute(call, {
        version: 3,
        maxFee: 10 ** 15,
        feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
        tip: 10 ** 13,
        paymasterData: [],
      });

      console.log(chalk.green('Transaction hash:'), txH);
      console.log(chalk.blue('Waiting for transaction confirmation...'));
      const txR = await this.provider.waitForTransaction(txH);
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

        console.log('Account created with address:', accountAddress);
        return {
          transactionHash: txH,
          accountAddress,
          receipt: txR,
        };
      }
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      // console.error('Error creating account:', error);
      // throw new Error('Failed to create account');
    }
  };

  registerUserTOLiquidity = async (
    userAddress: string,
    fiatAccountId: string,
  ) => {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');
    if (!userAddress) throw new Error('user address is required');
    if (!fiatAccountId) throw new Error('fiat account id is required');

    if (!this.private_key || !this.accountAddress)
      throw new Error('account credentials required');

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'register_user',
      calldata: [userAddress, fiatAccountId],
    };

    const account = this.getDeployerWallet();

    const { transaction_hash: txH } = await account.execute(call, {
      version: 3,
      maxFee: 10 ** 15,
      feeDataAvailabilityMode: RPC.EDataAvailabilityMode.L1,
      tip: 10 ** 13,
      paymasterData: [],
      resourceBounds: {
        l1_gas: {
          max_amount: num.toHex(this.maxQtyGasAuthorized),
          max_price_per_unit: num.toHex(this.maxPriceAuthorizeForOneGas),
        },
        l2_gas: {
          max_amount: num.toHex(0),
          max_price_per_unit: num.toHex(0),
        },
      },
    });

    const txR = await this.provider.waitForTransaction(txH);
    if (txR.isSuccess()) {
      console.log('Paid fee =', txR.statusReceipt);
    }
  };

  checkUserRegistered = async (userAddress: string) => {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');

    if (!userAddress) throw new Error('user address is required');

    const liquidityClass = await getClassAt(this.liquidityContractAddress);

    await writeAbiToFile(liquidityClass, 'liquidityAbi');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result = await liquidityContract.is_user_registered(userAddress);
    return result;
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
    return new Account(this.provider, this.accountAddress, this.private_key);
  };

  getAccountAddress = async (userAddress: string) => {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');

    if (!userAddress) throw new Error('user address is required');

    const AccountClass = await getClassAt(this.accountFactoryAddress);

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
      const isRegistered = await this.checkUserRegistered(userAddress);

      // Get user account address from factory
      const accountAddress = await this.getAccountAddress(userAddress);

      // Get account nonce as a way to check if account exists and is active
      let nonce = '0';
      try {
        const nonceResponse = await this.provider.getNonceForAddress(
          accountAddress.toString(),
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
}
