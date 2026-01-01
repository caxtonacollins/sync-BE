import { Injectable } from '@nestjs/common';
import { RpcProvider, Contract, uint256 } from 'starknet';
import {
  connectToStarknet,
  convertToWei,
  stringToFelt252,
  toJSONSafeValue,
  felt252ToString,
  convertFromWei,
  feltToContractAddress,
  getDeployerWallet,
  getUserStarknetAddress,
} from '../../helpers/utils.helper';
import { KeyManagementService } from 'src/transaction/wallet/key-management.service';
import { TokenContractService } from '../erc20-token/erc20-token.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class StakingContractService {
  private provider: RpcProvider;
  private stakingContractAddress: string;
  private contract: Contract;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyManagementService: KeyManagementService,
    private readonly tokenContractService: TokenContractService,
  ) {
    this.provider = connectToStarknet();
    this.stakingContractAddress = process.env.STAKING_CONTRACT_ADDRESS || '';
  }

  // Use shared getDeployerWallet from contract utils

  // WRITE methods
  async stake(
    userId: string,
    tokenSymbol: string,
    amount: string,
    decimals: number,
    lockDuration: number,
  ) {
    try {
      const userWalletAddress = await getUserStarknetAddress(this.prisma, userId);

      const amountInWei = convertToWei(amount, decimals);
      const amountU256 = uint256.bnToUint256(amountInWei);
      const lockDurationInSeconds = Math.floor(lockDuration / 1000);
      const lockDurationU64 = BigInt(lockDurationInSeconds);

      const stakingPool = await this.contract.get_pool(tokenSymbol);

      if (!stakingPool.is_active) {
        throw new Error('Staking pool is not active');
      }

      if (amountInWei < stakingPool.min_stake_amount) {
        throw new Error('Amount is too low');
      }

      if (amountInWei > stakingPool.max_stake_amount) {
        throw new Error('Amount is too high');
      }

      const tokenAddress =
        this.tokenContractService.getTokenAddress(tokenSymbol);
      if (!tokenAddress) throw new Error(`Token ${tokenSymbol} not supported`);

      await this.tokenContractService.approveTokenWithUserCredentials(
        userId,
        tokenAddress,
        this.stakingContractAddress,
        amountU256,
      );

      const call = {
        contractAddress: this.stakingContractAddress,
        entrypoint: 'stake',
        calldata: [
          userWalletAddress,
          tokenSymbol,
          amountU256.low,
          amountU256.high,
          lockDurationU64,
        ],
      };
      return this.keyManagementService.executeTransaction(userId, [call], userWalletAddress);
    } catch (error) {
      console.error('Failed to stake:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async unstake(userId: string, tokenSymbol: string, stakeId: number) {
    const userWalletAddress = await getUserStarknetAddress(this.prisma, userId);

    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'unstake',
      calldata: [userWalletAddress, tokenSymbol, stakeId],
    };
    return this.keyManagementService.executeTransaction(userId, [call], userWalletAddress);
  }

  async claimRewards(userId: string, tokenSymbol: string, stakeId: number) {
    const userWalletAddress = await getUserStarknetAddress(this.prisma, userId);

    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'claim_rewards',
      calldata: [userWalletAddress, tokenSymbol, stakeId],
    };
    return this.keyManagementService.executeTransaction(userId, [call], userWalletAddress);
  }

  async emergencyUnstake(userId: string, tokenSymbol: string, stakeId: number) {
    const userWalletAddress = await getUserStarknetAddress(this.prisma, userId);

    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'emergency_unstake',
      calldata: [userWalletAddress, tokenSymbol, stakeId],
    };
    return this.keyManagementService.executeTransaction(userId, [call], userWalletAddress);
  }

  async executeUserStakingTransaction(userId: string, calls: any[]) {
    const userWalletAddress = await getUserStarknetAddress(this.prisma, userId);
    return this.keyManagementService.executeTransaction(userId, calls, userWalletAddress);
  }
  async createStakingPool(
    tokenSymbol: string,
    tokenAddress: string,
    baseApyBps: number,
    bonusApyBps: number,
    minStakeAmount: string,
    maxStakeAmount: string,
  ) {
    const decimals = 18; // TODO: get decimals from token contract
    const formatForDb = (amount: string) =>
      convertFromWei(amount, decimals).replace(/,/g, '');

    const account = getDeployerWallet();
    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'create_staking_pool',
      calldata: [
        tokenSymbol,
        tokenAddress,
        baseApyBps,
        bonusApyBps,
        uint256.bnToUint256(BigInt(minStakeAmount)),
        uint256.bnToUint256(BigInt(maxStakeAmount)),
      ],
    };

    await this.prisma.cryptoStakingPool.create({
      data: {
        tokenSymbol,
        tokenAddress,
        baseApyBps,
        bonusApyBps,
        minStakeAmount: formatForDb(minStakeAmount),
        maxStakeAmount: formatForDb(maxStakeAmount),
      },
    });

    return await account.execute(call);
  }

  async updatePoolApy(
    tokenSymbol: string,
    baseApyBps: number,
    bonusApyBps: number,
  ) {
    const account = getDeployerWallet();
    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'update_pool_apy',
      calldata: [tokenSymbol, baseApyBps, bonusApyBps],
    };
    return await account.execute(call);
  }

  async togglePool(tokenSymbol: string) {
    const account = getDeployerWallet();
    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'toggle_pool',
      calldata: [tokenSymbol],
    };
    return await account.execute(call);
  }

  async pause() {
    const account = getDeployerWallet();
    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'pause',
      calldata: [],
    };
    return await account.execute(call);
  }

  async unpause() {
    const account = getDeployerWallet();
    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'unpause',
      calldata: [],
    };
    return await account.execute(call);
  }

  async recordFiatStake(
    userId: string,
    tokenSymbol: string,
    amount: bigint,
    lockDuration: number,
    stakeId: number, // Changed from string to number to match contract u64
  ) {

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { starknetAccountAddress: true },
    });

    if (!user?.starknetAccountAddress) {
      throw new Error('User must have a Starknet account address');
    }

    // Convert tokenSymbol to felt252
    const tokenSymbolFelt = stringToFelt252(tokenSymbol);

    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'record_fiat_stake',
      calldata: [
        user.starknetAccountAddress,
        tokenSymbolFelt,
        uint256.bnToUint256(amount).low,
        uint256.bnToUint256(amount).high,
        BigInt(lockDuration),
        BigInt(stakeId),
      ],
    };
    
    // Only owner can call this - use deployer wallet, not user's wallet
    const account = getDeployerWallet();
    return await account.execute(call);
  }

  async recordFiatUnstake(userId: string, tokenSymbol: string, stakeId: number) {

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { starknetAccountAddress: true },
    });

    if (!user?.starknetAccountAddress) {
      throw new Error('User must have a Starknet account address');
    }

    // Convert tokenSymbol to felt252
    const tokenSymbolFelt = stringToFelt252(tokenSymbol);

    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'record_fiat_unstake',
      calldata: [user.starknetAccountAddress, tokenSymbolFelt, BigInt(stakeId)],
    };
    
    // Only owner can call this - use deployer wallet
    const account = getDeployerWallet();
    return await account.execute(call);
  }

  async recordFiatRewardClaim(
    userId: string,
    tokenSymbol: string,
    stakeId: number,
    rewards: bigint,
  ) {

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { starknetAccountAddress: true },
    });

    if (!user?.starknetAccountAddress) {
      throw new Error('User must have a Starknet account address');
    }

    // Convert tokenSymbol to felt252
    const tokenSymbolFelt = stringToFelt252(tokenSymbol);

    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'record_fiat_reward_claim',
      calldata: [
        user.starknetAccountAddress,
        tokenSymbolFelt,
        BigInt(stakeId),
        uint256.bnToUint256(rewards).low,
        uint256.bnToUint256(rewards).high,
      ],
    };
    
    // Only owner can call this - use deployer wallet
    const account = getDeployerWallet();
    return await account.execute(call);
  }

  async updateBalanceMerkleRoot(merkleRoot: string) {
    const account = getDeployerWallet();
    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'update_balance_merkle_root',
      calldata: [merkleRoot],
    };
    return await account.execute(call);
  }

  async createReserveSnapshot(
    tokenSymbol: string,
    balance: bigint,
    ipfsHash: string,
  ) {
    const account = getDeployerWallet();
    
    // Convert tokenSymbol to felt252
    const tokenSymbolFelt = stringToFelt252(tokenSymbol);
    const ipfsHashFelt = stringToFelt252(ipfsHash);
    
    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'create_reserve_snapshot',
      calldata: [
        tokenSymbolFelt,
        uint256.bnToUint256(balance).low,
        uint256.bnToUint256(balance).high,
        ipfsHashFelt,
      ],
    };
    return await account.execute(call);
  }

  async upgradeContract(classHash: string) {
    const account = getDeployerWallet();
    const call = {
      contractAddress: this.stakingContractAddress,
      entrypoint: 'upgrade',
      calldata: [classHash],
    };
    return await account.execute(call);
  }

  private formatStakingPool(pool: any): any {
    const decimals = 18;

    const safeParseTimestamp = (timestamp: any): string => {
      try {
        const timestampMs = Number(timestamp) * 1000;
        return isNaN(timestampMs)
          ? new Date().toISOString()
          : new Date(timestampMs).toISOString();
      } catch (e) {
        console.error('Error parsing timestamp:', {
          timestamp,
          error: e.message,
        });
        return new Date().toISOString();
      }
    };

    const safeConvertFromWei = (amount: any): string => {
      try {
        return convertFromWei(amount, decimals);
      } catch (e) {
        console.error('Error converting from wei:', {
          amount,
          error: e.message,
        });
        return '0';
      }
    };

    const formatApy = (apyBps: any): string => {
      try {
        const apy = Number(apyBps) / 100;
        return isNaN(apy) ? '0.00%' : `${apy.toFixed(2)}%`;
      } catch (e) {
        console.error('Error formatting APY:', { apyBps, error: e.message });
        return '0.00%';
      }
    };

    const formattedPool = {
      ...pool,
      token_symbol: felt252ToString(pool?.token_symbol || ''),
      token_address: feltToContractAddress(pool?.token_address),
      base_apy_bps: formatApy(pool?.base_apy_bps),
      bonus_apy_bps: formatApy(pool?.bonus_apy_bps),
      total_staked: safeConvertFromWei(pool?.total_staked || '0'),
      total_stakers: pool?.total_stakers
        ? BigInt(pool.total_stakers).toString()
        : '0',
      min_stake_amount: safeConvertFromWei(pool?.min_stake_amount || '0'),
      max_stake_amount: safeConvertFromWei(pool?.max_stake_amount || '0'),
      created_at: safeParseTimestamp(pool?.created_at),
      last_updated: safeParseTimestamp(pool?.last_updated),
      is_active: Boolean(pool?.is_active),
    };

    return toJSONSafeValue(formattedPool);
  }

  async getStakingPool(tokenSymbol: string) {
    if (!this.contract) {
      throw new Error('Staking contract is not initialized');
    }
    const pool = await this.contract.get_pool(stringToFelt252(tokenSymbol));
    return this.formatStakingPool(pool);
  }

  private formatStakePosition(position: any): any {
    const decimals = 18; //TODO: Get decimals from token contract
    const formatTimestamp = (timestamp: any) => {
      const ts = Number(timestamp);
      return ts > 0 ? new Date(ts * 1000).toISOString() : null;
    };

    const formatApy = (apyBps: any): string => {
      try {
        const apy = Number(apyBps) / 100;
        return isNaN(apy) ? '0.00%' : `${apy.toFixed(2)}%`;
      } catch (e) {
        console.error('Error formatting APY:', { apyBps, error: e.message });
        return '0.00%';
      }
    };

    const formattedPosition = {
      ...position,
      stake_id: position.stake_id ? BigInt(position.stake_id).toString() : '0',
      user: position.user || '',
      token_symbol: felt252ToString(position?.token_symbol || ''),
      amount: convertFromWei(position?.amount || '0', decimals),
      staked_at: formatTimestamp(position?.staked_at),
      unlock_at: formatTimestamp(position?.unlock_at),
      last_reward_claim: formatTimestamp(position?.last_reward_claim),
      accumulated_rewards: convertFromWei(
        position?.accumulated_rewards || '0',
        decimals,
      ),
      is_active: Boolean(position?.is_active),
      lock_duration: Number(position?.lock_duration || 0),
      effective_apy_bps: formatApy(position?.effective_apy_bps),
    };
    return toJSONSafeValue(formattedPosition);
  }

  async getStakePosition(
    userAddress: string,
    tokenSymbol: string,
    stakeId: number,
  ) {
    const position = await this.contract.get_stake(
      userAddress,
      stringToFelt252(tokenSymbol),
      BigInt(stakeId),
    );
    return this.formatStakePosition(position);
  }

  async getStakePositions(userAddress: string, tokenSymbol: string) {
    const positions = await this.contract.get_all_user_stakes(
      userAddress,
      stringToFelt252(tokenSymbol),
    );
    return positions.map((position) => this.formatStakePosition(position));
  }

  private formatRewards(rewards: any): any {
    const decimals = 18; //TODO: Get decimals from token contract
    return toJSONSafeValue({
      ...rewards,
      reward_amount: convertFromWei(rewards.reward_amount, decimals),
    });
  }

  async calculateRewards(
    userAddress: string,
    tokenSymbol: string,
    stakeId: number,
  ) {
    const rewards = await this.contract.calculate_rewards(
      userAddress,
      stringToFelt252(tokenSymbol),
      stakeId,
    );
    return this.formatRewards(rewards);
  }

  async getUserTotalStaked(userAddress: string, tokenSymbol: string) {
    const totalStaked = await this.contract.get_user_total_staked(
      userAddress,
      stringToFelt252(tokenSymbol),
    );
    const decimals = 18; //TODO: Get decimals from token contract
    return toJSONSafeValue(convertFromWei(totalStaked, decimals));
  }

  async getUserStakeCount(userAddress: string, tokenSymbol: string) {
    const count = await this.contract.get_user_stake_count(
      userAddress,
      stringToFelt252(tokenSymbol),
    );
    return toJSONSafeValue(BigInt(count).toString());
  }

  async getAllPools() {
    const pools = await this.contract.get_all_pools();
    return pools.map((pool) => this.formatStakingPool(pool));
  }

  async getVersion() {
    const version = await this.contract.get_version();
    return toJSONSafeValue(BigInt(version).toString());
  }

  // Additional view functions from Cairo interface
  async getAllUserStakesBySymbol(userAddress: string, tokenSymbol: string) {
    const positions = await this.contract.get_all_user_stakes_by_symbol(
      userAddress,
      stringToFelt252(tokenSymbol),
    );
    return positions.map((position) => this.formatStakePosition(position));
  }

  async getAllUserStakes(userAddress: string) {
    const positions = await this.contract.get_all_user_stakes(userAddress);
    return positions.map((position) => this.formatStakePosition(position));
  }

  async getAllUserFiatStakes(userAddress: string, tokenSymbol: string) {
    const fiatStakes = await this.contract.get_all_user_fiat_stakes(
      userAddress,
      stringToFelt252(tokenSymbol),
    );
    return fiatStakes.map((stake) => this.formatFiatStake(stake));
  }

  private formatFiatStake(stake: any): any {
    const safeParseTimestamp = (timestamp: any): string => {
      try {
        const timestampMs = Number(timestamp) * 1000;
        return isNaN(timestampMs)
          ? new Date().toISOString()
          : new Date(timestampMs).toISOString();
      } catch (e) {
        console.error('Error parsing timestamp:', {
          timestamp,
          error: e.message,
        });
        return new Date().toISOString();
      }
    };

    const formattedStake = {
      user: stake.user,
      tokenSymbol: felt252ToString(stake?.tokenSymbol || ''),
      amount: convertFromWei(stake?.amount || '0', 18), // Assuming 18 decimals
      staked_at: safeParseTimestamp(stake?.staked_at),
      lock_duration: Number(stake?.lock_duration || 0),
      is_active: Boolean(stake?.is_active),
    };

    return toJSONSafeValue(formattedStake);
  }
}
