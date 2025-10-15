import { Injectable, Logger } from '@nestjs/common';
import { TransactionService } from '../transaction/transaction.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ContractService } from '../contract/contract.service';

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly contractService: ContractService,
  ) {}

  async transferToken(dto: CreateTransferDto, userId: string) {
    this.logger.log(`Initiating token transfer for user ${userId}`);
    const { toAddress, amount, token } = dto;
    // TODO: Get user's Starknet address

    const tx = await this.contractService.transferToken(
      userId,
      toAddress,
      amount.toString(),
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
      transactionHash: tx.transactionHash,
    });

    return { status: 'processing', transaction };
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
