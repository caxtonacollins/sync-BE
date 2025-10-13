import { Injectable, Logger } from '@nestjs/common';
import { TransactionService } from '../transaction/transaction.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(
    private readonly transactionService: TransactionService,
  ) {}

  async transferToken(dto: CreateTransferDto) {
    this.logger.log(`Initiating token transfer for user ${dto.userId}`);

    // TODO: Get user's Starknet address
    const fromAddress = 'TODO';

    // TODO: Implement the actual token transfer
    // const tx = await this.contractService.transfer(fromAddress, dto.toAddress, dto.amount, dto.token);

    // Create a transaction record
    const transaction = await this.transactionService.createTransaction({
      user: {
        connect: {
          id: dto.userId,
        },
      },
      type: 'transfer',
      status: 'processing',
      amount: dto.amount,
      netAmount: dto.amount, // Assuming no fee for now
      currency: dto.token,
      reference: `TRANSFER_${Date.now()}`,
      // transactionHash: tx.transaction_hash,
      // Link to the recipient's user ID if known
    });

    return { status: 'processing', transaction };
  }

  async transferFiat(dto: CreateTransferDto) {
    this.logger.log(`Initiating fiat transfer for user ${dto.userId}`);

    // TODO: Implement the actual fiat transfer

    const transaction = await this.transactionService.createTransaction({
      user: {
        connect: {
          id: dto.userId,
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
