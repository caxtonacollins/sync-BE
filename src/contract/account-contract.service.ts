import { Injectable } from '@nestjs/common';
import { Account, RpcProvider, ec, stark, hash, CallData } from 'starknet';
import {
  connectToStarknet,
  createKeyPair,
  createNewContractInstance,
  encryptPrivateKey,
  getClassAt,
  uuidToFelt252,
  writeAbiToFile,
} from './utils';

@Injectable()
export class AccountContractService {
  private provider: RpcProvider;
  private accountFactoryAddress: string;
  private accountContractHash: string;
  private accountAddress: string;
  private private_key: string;

  constructor() {
    this.provider = connectToStarknet();
    this.accountFactoryAddress = process.env.ACCOUNT_FACTORY_ADDRESS || '';
    this.accountContractHash = process.env.ACCOUNT_CONTRACT_HASH || '';
    this.accountAddress = process.env.DEPLOYER_ADDRESS || '';
    this.private_key = process.env.DEPLOYER_PRIVATE_KEY || '';
  }

  /**
   * Create a new account for a user
   */
  async createAccount(user_unique_id: string) {
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

      const { transaction_hash: txH } = await account.execute(call, {
        maxFee: 10 ** 15,
      });

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
  }

  /**
   * Get account address for a user
   */
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

  /**
   * Get user dashboard data
   */
  async getUserDashboardData(userAddress: string) {
    if (!userAddress) throw new Error('user address is required');

    const userFelt252Id = uuidToFelt252(userAddress);

    try {
      const accountAddress = await this.getAccountAddress(userFelt252Id);
      console.log('accountAddress', accountAddress);

      // Note: isRegistered check would need to be imported from liquidity service
      // For now, we'll return basic data
      return {
        accountAddress: accountAddress?.toString() || null,
      };
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw new Error('Failed to fetch dashboard data');
    }
  }

  /**
   * Compute a new account address (without creating it)
   */
  computeAddress() {
    const privateKey = stark.randomAddress();
    const starkKeyPub = ec.starkCurve.getStarkKey(privateKey);

    const OZaccountClassHash = this.accountContractHash;
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
  }

  /**
   * Get deployer wallet instance
   */
  getDeployerWallet() {
    if (!this.provider || !this.accountAddress || !this.private_key) {
      throw new Error("credentials required to deploy deployer's wallet");
    }
    return new Account(this.provider, this.accountAddress, this.private_key);
  }
}
