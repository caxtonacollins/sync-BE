import { Injectable, Logger } from '@nestjs/common';
import { Account, RpcProvider } from 'starknet';
import 'dotenv/config';
import { connectToStarknet, getDeployerWallet } from '../helpers/utils.helper';

@Injectable()
export class TXContractService {
    private readonly logger = new Logger(TXContractService.name);
    private provider: RpcProvider;
 

    constructor() {
        this.provider = connectToStarknet();
    }

    async getTransactionStatus(transactionHash: string): Promise<{
        status: 'SUCCEEDED' | 'REVERTED' | 'ERROR';
        blockNumber?: number;
        blockHash?: string;
    }> {
        try {
            this.logger.log(`Checking transaction status: ${transactionHash}`);

            const txReceipt = await this.provider.getTransactionReceipt(transactionHash);
            return {
              status: txReceipt.statusReceipt,
            };
        } catch (error) {
            this.logger.error(`Failed to get transaction status:`, error);
            throw error;
        }
    }

    async estimateTransactionFee(
        contractAddress: string,
        entrypoint: string,
        calldata: any[],
    ): Promise<{ resourceBounds: any; overall_fee: any; unit: any; }> {
            const account = getDeployerWallet();
        
        try {
            this.logger.log(`Estimating fee for ${contractAddress}:${entrypoint}`);

            const { resourceBounds, overall_fee, unit } = await account.estimateInvokeFee({
                contractAddress,
                entrypoint,
                calldata,
            });

            return {
                resourceBounds, overall_fee, unit
            };
        } catch (error) {
            this.logger.error(`Failed to estimate transaction fee:`, error);
            throw error;
        }
    }
}