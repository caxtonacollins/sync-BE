import { Injectable } from '@nestjs/common';
import {
    Account,
    RpcProvider,
    Contract,
    uint256,
} from 'starknet';
import { connectToStarknet, writeAbiToFile, getClassAt } from '../../utils';
import { KeyManagementService } from 'src/wallet/key-management.service';

@Injectable()
export class StakingContractService {
    private provider: RpcProvider;
    private stakingContractAddress: string;
    private accountAddress: string;
    private private_key: string;
    private contract: Contract;

    constructor(private readonly keyManagementService: KeyManagementService) {
        this.provider = connectToStarknet();
        this.stakingContractAddress = process.env.STAKING_CONTRACT_ADDRESS || '';
        this.accountAddress = process.env.DEPLOYER_ADDRESS || '';
        this.private_key = process.env.DEPLOYER_PRIVATE_KEY || '';
        this.initializeContract();
    }

    private async initializeContract() {
        if (!this.stakingContractAddress) {
            console.error('STAKING_CONTRACT_ADDRESS env variable is not set');
            return;
        }
        try {
            const stakingContractClass = await getClassAt(this.stakingContractAddress);
            await writeAbiToFile(stakingContractClass, 'stakingContractAbi');
            this.contract = new Contract(
                stakingContractClass.abi,
                this.stakingContractAddress,
                this.provider,
            );
        } catch (error) {
            console.error('Failed to initialize staking contract:', error);
        }
    }

    private getDeployerWallet() {
        if (!this.provider || !this.accountAddress || !this.private_key) {
            throw new Error("Credentials required for deployer's wallet");
        }
        const account = new Account(
            this.provider,
            this.accountAddress,
            this.private_key,
        );
        return account;
    }

    // WRITE methods
    async executeUserStakingTransaction(userId: string, calls: any[]) {
        return this.keyManagementService.executeTransaction(userId, calls);
    }
    async createStakingPool(
        tokenSymbol: string,
        tokenAddress: string,
        baseApyBps: number,
        bonusApyBps: number,
        minStakeAmount: string,
        maxStakeAmount: string,
    ) {
        const account = this.getDeployerWallet();
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
        return await account.execute(call);
    }

    async updatePoolApy(tokenSymbol: string, baseApyBps: number, bonusApyBps: number) {
        const account = this.getDeployerWallet();
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'update_pool_apy',
            calldata: [tokenSymbol, baseApyBps, bonusApyBps],
        };
        return await account.execute(call);
    }

    async togglePool(tokenSymbol: string) {
        const account = this.getDeployerWallet();
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'toggle_pool',
            calldata: [tokenSymbol],
        };
        return await account.execute(call);
    }

    async pause() {
        const account = this.getDeployerWallet();
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'pause',
            calldata: [],
        };
        return await account.execute(call);
    }

    async unpause() {
        const account = this.getDeployerWallet();
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'unpause',
            calldata: [],
        };
        return await account.execute(call);
    }

    async recordFiatStake(userId: string, currency: string, amount: bigint, lockDuration: number, stakeId: string) {
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'record_fiat_stake',
            calldata: [currency, amount, lockDuration, stakeId],
        };
        return this.keyManagementService.executeTransaction(userId, [call]);
    }

    async recordFiatUnstake(userId: string, currency: string, stakeId: string) {
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'record_fiat_unstake',
            calldata: [currency, stakeId],
        };
        return this.keyManagementService.executeTransaction(userId, [call]);
    }

    async recordFiatRewardClaim(userId: string, currency: string, stakeId: string, rewards: string) {
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'record_fiat_reward_claim',
            calldata: [userId, currency, stakeId, uint256.bnToUint256(BigInt(rewards))],
        };
        return this.keyManagementService.executeTransaction(userId, [call]);
    }

    async updateBalanceMerkleRoot(merkleRoot: string) {
        const account = this.getDeployerWallet();
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'update_balance_merkle_root',
            calldata: [merkleRoot],
        };
        return await account.execute(call);
    }

    async createReserveSnapshot(currency: string, balance: bigint, signature: string, ipfsHash: string) {
        const account = this.getDeployerWallet();
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'create_reserve_snapshot',
            calldata: [currency, balance, signature, ipfsHash],
        };
        return await account.execute(call);
    }

    async upgradeContract(classHash: string) {
        const account = this.getDeployerWallet();
        const call = {
            contractAddress: this.stakingContractAddress,
            entrypoint: 'upgrade',
            calldata: [classHash],
        };
        return await account.execute(call);
    }

    // READ methods (use the provider)

    async getStakingPool(tokenSymbol: string) {
        return await this.contract.get_staking_pool(tokenSymbol);
    }

    async getStakePosition(userAddress: string, tokenSymbol: string, stakeId: number) {
        return await this.contract.get_stake_position(userAddress, tokenSymbol, stakeId);
    }

    async calculateRewards(userAddress: string, tokenSymbol: string, stakeId: number) {
        return await this.contract.calculate_rewards(userAddress, tokenSymbol, stakeId);
    }

    async getUserTotalStaked(userAddress: string, tokenSymbol: string) {
        return await this.contract.get_user_total_staked(userAddress, tokenSymbol);
    }

    async getUserStakeCount(userAddress: string, tokenSymbol: string) {
        return await this.contract.get_user_stake_count(userAddress, tokenSymbol);
    }

    async getAllPools() {
        return await this.contract.get_all_pools();
    }

    async getVersion() {
        return await this.contract.version();
    }
}
