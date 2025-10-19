import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
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

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
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

        // Invalidate cache for this user
        await this.invalidateAccountCache(user_unique_id);

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
   * Get account address for a user with Redis caching
   */
  async getAccountAddress(userAddress: string) {
    if (!this.accountFactoryAddress)
      throw new Error('ACCOUNT_FACTORY_ADDRESS env variable is not set');
    if (!userAddress) throw new Error('user address is required');

    // Check Redis cache first
    const cacheKey = `account:address:${userAddress}`;
    const cachedAddress = await this.cacheManager.get<string>(cacheKey);
    if (cachedAddress) {
      console.log(`[Cache Hit] Account address for ${userAddress}`);
      return cachedAddress;
    }

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

      // Cache the result in Redis (TTL: 5 minutes)
      await this.cacheManager.set(cacheKey, hexValue, 300000);

      return hexValue;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Get user dashboard data with caching
   */
  async getUserDashboardData(userAddress: string) {
    if (!userAddress) throw new Error('user address is required');

    const userFelt252Id = uuidToFelt252(userAddress);

    // Check cache first
    const cacheKey = `dashboard:${userAddress}`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache Hit] Dashboard data for ${userAddress}`);
      return cachedData;
    }

    try {
      const accountAddress = await this.getAccountAddress(userFelt252Id);
      console.log('accountAddress', accountAddress);

      // Note: isRegistered check would need to be imported from liquidity service
      // For now, we'll return basic data
      const dashboardData = {
        accountAddress: accountAddress?.toString() || null,
      };

      // Cache the result (TTL: 1 minute)
      await this.cacheManager.set(cacheKey, dashboardData, 60000);

      return dashboardData;
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
    if (!this.provider || !this.accountAddress || !this.private_key)
      throw new Error("credentials required to deploy deployer's wallet");
    return new Account(this.provider, this.accountAddress, this.private_key);
  }

  /**
   * Invalidate account cache
   */
  async invalidateAccountCache(userAddress: string) {
    const cacheKeys = [
      `account:address:${userAddress}`,
      `dashboard:${userAddress}`,
    ];
    await Promise.all(cacheKeys.map((key) => this.cacheManager.del(key)));
  }
}
