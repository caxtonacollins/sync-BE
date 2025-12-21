import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { RpcProvider, RPC } from 'starknet';
import { connectToStarknet, createNewContractInstance, getDeployerWallet } from '../../utils';

@Injectable()
export class AccountFactoryContractService {
  private provider: RpcProvider;
  private accountFactoryAddress: string;
  private accountContractHash: string;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    this.provider = connectToStarknet();
    this.accountFactoryAddress = process.env.ACCOUNT_FACTORY_ADDRESS || '';
    this.accountContractHash = process.env.ACCOUNT_CONTRACT_HASH || '';
  }

  /**
   * Set account class hash in account factory
   */
  async setAccountClassHash(classHash: string) {
    if (!classHash) throw new Error('class hash is required');
    this.accountContractHash = classHash;

    const call = {
      contractAddress: this.accountFactoryAddress,
      entrypoint: 'set_account_class_hash',
      calldata: [classHash],
    };

    const account = getDeployerWallet();
    await account.execute(call);

    // Invalidate cache
    await this.cacheManager.del('account:class:hash');

    console.log('Account class hash set successfully');
  }

  /**
   * Get account class hash with caching
   */
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

  /**
   * Transfer factory ownership
   */
  async transferFactoryOwnership(newOwnerAddress: string) {
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
  }

  /**
   * Upgrade account factory contract
   */
  async upgradeAccountFactory(classHash: string) {
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

}
