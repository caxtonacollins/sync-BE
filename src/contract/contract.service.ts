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
  private account_address: string;
  private maxQtyGasAuthorized: string;
  private maxPriceAuthorizeForOneGas: string;

  constructor() {
    this.provider = connectToStarknet();
    this.liquidityContractAddress =
      process.env.LIQUIDITY_CONTRACT_ADDRESS || '';
    this.accountAddress = process.env.ACCOUNT_ADDRESS || '';
    this.accountFactoryAddress = process.env.ACCOUNT_FACTORY_ADDRESS || '';
    this.accountContractHash = process.env.ACCOUNT_CONTRACT_HASH || '';

    this.private_key = process.env.DEPLOYER_PRIVATE_KEY || '';
    this.account_address = process.env.ACCOUNT_ADDRESS || '';
    this.maxQtyGasAuthorized = '2000';
    this.maxPriceAuthorizeForOneGas = '16283550959677';
  }

  private getAccount(): Account {
    return new Account(this.provider, this.accountAddress, this.private_key);
  }

  createAccount = async (user_unique_id: string) => {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');
    if (!this.accountContractHash)
      throw new Error('ACCOUNT_CONTRACT_HASH env variable is not set');
    if (!this.private_key) throw new Error('private key is required');
    if (!user_unique_id) throw new Error('user unique id is required');

    try {
      const accountFactoryClass = await this.provider.getClassAt(
        this.accountFactoryAddress,
      );

      await writeAbiToFile(accountFactoryClass, 'accountFactoryAbi');

      const { publicKey } = createKeyPair();

      const call = {
        contractAddress: this.accountFactoryAddress,
        entrypoint: 'create_account',
        calldata: [publicKey, user_unique_id],
      };

      const account = this.getAccount();

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
        console.log('Paid fee =', txR.actual_fee);
      }
    } catch (error) {
      console.error('Error creating account:', error);
      throw new Error('Failed to create account');
    }
  };

  registerUserTOLiquidity = async (
    user_address: string,
    fiat_account_id: string,
  ) => {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');
    if (!user_address) throw new Error('user address is required');
    if (!fiat_account_id) throw new Error('user address is required');

    if (!this.private_key || !this.account_address)
      throw new Error('account credentials required');

    const liquidityClass = await this.provider.getClassAt(
      this.liquidityContractAddress,
    );
    if (!liquidityClass.abi)
      throw new Error('No ABI found for liquidity contract');

    const call = {
      contractAddress: this.liquidityContractAddress,
      entrypoint: 'register_user',
      calldata: [user_address, fiat_account_id],
    };

    const account = this.getAccount();

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
      console.log('Paid fee =', txR.actual_fee);
    }
  };

  checkUserRegistered = async (user_address: string) => {
    if (!this.liquidityContractAddress)
      throw new Error('LIQUIDITY_CONTRACT_ADDRESS env variable is not set');

    if (!user_address) throw new Error('user address is required');

    const liquidityClass = await getClassAt(this.liquidityContractAddress);

    await writeAbiToFile(liquidityClass, 'liquidityAbi');

    const liquidityContract = createNewContractInstance(
      liquidityClass.abi,
      this.liquidityContractAddress,
    );

    const result = await liquidityContract.is_user_registered(user_address);
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
}
