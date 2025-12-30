import { Injectable } from '@nestjs/common';
import { RpcProvider } from 'starknet';
import {
  connectToStarknet,
  createKeyPair,
  createNewContractInstance,
  encryptPrivateKey,
  getClassAt,
  uuidToFelt252,
  writeAbiToFile,
  getDeployerWallet,
} from '../../utils';

@Injectable()
export class AccountContractService {
  private provider: RpcProvider;
  private accountFactoryAddress: string;

  constructor() {
    this.provider = connectToStarknet();
    this.accountFactoryAddress = process.env.ACCOUNT_FACTORY_ADDRESS || '';
  }

  async createAccount(user_unique_id: string): Promise<{
    transactionHash: string;
    accountAddress?: string;
    encryptedPrivateKey?: string;
    receipt?: any;
  }> {
    if (!user_unique_id) throw new Error('user unique id is required');
    if (!this.accountFactoryAddress) {
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');
    }

    const userFelt252Id = uuidToFelt252(user_unique_id);
    let transactionHash = '';
    let accountAddress = '';
    let encryptedPrivateKey = '';
    let receipt: any = null;

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

      const account = getDeployerWallet();

      const { transaction_hash: txH } = await account.execute({
        contractAddress: call.contractAddress,
        entrypoint: call.entrypoint,
        calldata: call.calldata
      },
        // {
        //   maxFee: 10n ** 15n
        // }
      );

      const txR = await this.provider.waitForTransaction(txH);

      if (!txR) {
        throw new Error('Transaction failed: No receipt received');
      }

      if (!txR.isSuccess()) {
        throw new Error('Transaction execution failed');
      }

      // Parse the account creation event
      const events = txR.value?.events || [];
      const accountCreatedEvent = events.find(
        (event) =>
          event.keys?.[0] ===
          '0x1d9ca8a89626bead91b5cb4275a622219e9443975b34f3fdbc683e8621231a9',
      );

      if (!accountCreatedEvent?.data?.[1]) {
        throw new Error(
          'Account creation event not found in transaction receipt',
        );
      }

      // Update the values
      transactionHash = txH;
      accountAddress = accountCreatedEvent.data[1];
      receipt = txR!;

      return {
        transactionHash,
        accountAddress,
        encryptedPrivateKey,
        receipt
      };
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async getAccountAddress(userAddress: string) {
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
      return '0x' + BigInt(feltValue as string).toString(16);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  async setAccountClassHash(classHash: string): Promise<{
    transactionHash: string;
    receipt: any;
  }> {
    if (!classHash) throw new Error('class hash is required');
    if (!this.accountFactoryAddress) {
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');
    }

    try {
      const call = {
        contractAddress: this.accountFactoryAddress,
        entrypoint: 'set_account_class_hash',
        calldata: [classHash],
      };

      const account = getDeployerWallet();
      const { transaction_hash: txHash } = await account.execute(call);
      const receipt = await this.provider.waitForTransaction(txHash);

      if (!receipt || !receipt.isSuccess()) {
        throw new Error('Failed to set account class hash');
      }

      console.log('Account class hash set successfully');

      return {
        transactionHash: txHash,
        receipt: receipt
      };
    } catch (error) {
      console.error('Error in setAccountClassHash:', error);
      throw error;
    }
  }

  async getAccountClassHash() {
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
    const feltValue = Array.isArray(result) ? result[0] : result;

    // Convert decimal string to hex
    const hexValue = '0x' + BigInt(feltValue as string).toString(16);

    return hexValue;
  }

  async transferFactoryOwnership(newOwnerAddress: string): Promise<{
    transactionHash: string;
    receipt: any;
  }> {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');
    if (!newOwnerAddress) throw new Error('newOwnerAddress is required');

    try {
      const call = {
        contractAddress: this.accountFactoryAddress,
        entrypoint: 'transfer_ownership',
        calldata: [newOwnerAddress],
      };

      const account = getDeployerWallet();

      const { transaction_hash: txH } = await account.execute(call);
      const receipt = await this.provider.waitForTransaction(txH);

      if (!receipt || !receipt.isSuccess()) {
        throw new Error('Failed to set account class hash');
      }

      return {
          transactionHash: txH,
          receipt: receipt,
        };
    } catch (error) {
      console.error(JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async setLiquidityBridge(liquidityBridgeAddress: string): Promise<{
    transaction_hash: string;
  }> {
    if (!liquidityBridgeAddress)
      throw new Error('liquidityBridgeAddress is required');
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');

    const call = {
      contractAddress: this.accountFactoryAddress,
      entrypoint: 'set_liquidity_bridge',
      calldata: [liquidityBridgeAddress],
    };

    const account = getDeployerWallet();

    const { transaction_hash: txH } = await account.execute({
      contractAddress: call.contractAddress,
      entrypoint: call.entrypoint,
      calldata: call.calldata
    });

    const txR = await this.provider.waitForTransaction(txH);

    if (txR.isSuccess()) {
      console.log(`Successfully set liquidity bridge to ${liquidityBridgeAddress}`);
      return {
        transaction_hash: txH,
      };
    } else {
      throw new Error('Liquidity bridge setting transaction failed');
    }
  }

  async getLiquidityBridge() {
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

    const result = await accountFactoryContract.get_liquidity_bridge();
    const feltValue = Array.isArray(result) ? result[0] : result;

    // Convert decimal string to hex
    const hexValue = '0x' + BigInt(feltValue as string).toString(16);

    return hexValue;
  }

  async upgradeAccountFactory(classHash: string): Promise<{
    transactionHash: string;
    receipt: any;
  }> {
    if (!classHash) throw new Error('class hash is required');
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');

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

    const account = getDeployerWallet();
    const { transaction_hash: txH } = await account.execute({
      contractAddress: call.contractAddress,
      entrypoint: call.entrypoint,
      calldata: call.calldata
    });

    const txR = await this.provider.waitForTransaction(txH);

    if (txR.isSuccess()) {
      console.log('Successfully upgraded account factory');
      return {
        transactionHash: txH,
        receipt: txR
      };
    } else {
      console.error('Failed to upgrade account factory');
      throw new Error('Failed to upgrade account factory');
    }
  }
}
