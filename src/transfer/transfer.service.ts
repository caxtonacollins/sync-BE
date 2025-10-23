import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { TransactionService } from '../transaction/transaction.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ContractService } from '../contract/contract.service';
import { TokenContractService } from '../contract/token-contract.service';
import { createNewContractInstance } from '../contract/utils';
import erc20 from '../contract/abi/erc20.json';

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(
    private readonly transactionService: TransactionService,
    @Inject(forwardRef(() => ContractService))
    private readonly contractService: ContractService,
    private readonly tokenService: TokenContractService,
  ) {}

  async transferToken(dto: CreateTransferDto, userId: string) {
    this.logger.log(`Initiating token transfer for user ${userId}`);
    const { toAddress, amount, token } = dto;
    
    try {
      // Get the user's wallet address
      const userWallet = await this.contractService.getAccountAddress(userId);
      if (!userWallet) {
        throw new Error('User wallet not found');
      }

      // Get token address
      const tokenAddress = this.tokenService.getTokenAddress(token);
      
      // Get the token contract instance
      const tokenContract = createNewContractInstance(erc20, tokenAddress);
      
      // Get token decimals for amount conversion
      const decimals = this.tokenService.getTokenDecimals(token);
      const amountInWei = BigInt(Math.floor(amount * Math.pow(10, decimals)));
      
      // Execute the transfer
      const tx = await tokenContract.transfer(
        toAddress,
        amountInWei.toString()
      );

      // Create a transaction record
      const transaction = await this.transactionService.createTransaction({
        user: {
          connect: {
            id: userId,
          },
        },
        type: 'transfer',
        status: 'processing',
        amount: amount,
        netAmount: amount, // Assuming no fee for now
        currency: token,
        reference: `TRANSFER_${Date.now()}`,
        transactionHash: tx.transaction_hash,
      });

      return { status: 'processing', transaction };
    } catch (error) {
      this.logger.error(`Error transferring token: ${error.message}`, error.stack);
      throw new Error(`Failed to transfer token: ${error.message}`);
    }
  }

  async transferFiat(dto: CreateTransferDto, userId: string) {
    this.logger.log(`Initiating fiat transfer for user ${userId}`);

    // TODO: Implement the actual fiat transfer

    const transaction = await this.transactionService.createTransaction({
      user: {
        connect: {
          id: userId,
        },
      },
      type: 'transfer',
      status: 'processing',
      amount: dto.amount,
      netAmount: dto.amount, // Assuming no fee for now
      currency: dto.token,
      reference: `TRANSFER_${Date.now()}`,
    });

    return { status: 'processing', transaction };
  }
}
