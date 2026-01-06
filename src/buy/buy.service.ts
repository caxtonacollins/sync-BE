import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { FlutterwaveService } from 'src/payment/flutterwave/flutterwave.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateBuyRequestDto } from 'src/types/dto/buy/buy-request.dto';
import { BalanceService } from 'src/payment/balance.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { WalletService } from 'src/transaction/wallet/wallet.service';
import { toSmallestUnit } from 'libs/currency.utils';

// src/buy/buy.service.ts
@Injectable()
export class BuyService {
  constructor(
    private prisma: PrismaService,
    private flutterwaveService: FlutterwaveService,
    private auditLogService: AuditLogService,
    private balanceService: BalanceService,
    private tokenContractService: TokenContractService,
    private walletService: WalletService,
  ) {}

  async initiateBuy(
    userId: string,
    { amountNGN, paymentMethod, bankCode }: CreateBuyRequestDto,
  ) {
    // 1. Create pending transaction
    const transaction = await this.prisma.$transaction(async (prisma) => {
      const tx = await prisma.transaction.create({
        data: {
          userId,
          type: 'BUY',
          status: 'PENDING',
          amount: amountNGN,
          tokenSymbol: 'sNGN',
          netAmount: amountNGN,
          reference: `tx_${Date.now()}_${userId}`,
          metadata: {
            paymentMethod,
            bankCode,
          },
        },
      });

      await this.auditLogService.create({
        action: 'BUY_INITIATED',
        entityType: 'Transaction',
        entityId: tx.id,
        user: {
          connect: {
            id: userId,
          },
        },
        metadata: {
          amountNGN,
          paymentMethod,
        },
      });

      return tx;
    });

    // 2. Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    // 3. Prepare Flutterwave payload
    const txRef = `BUY-${transaction.id}`;
    const payload = {
      tx_ref: txRef,
      amount: amountNGN,
      currency: 'NGN',
      payment_options: paymentMethod === 'card' ? 'card' : 'banktransfer',
      customer: {
        email: user?.email,
        name: `${user?.firstName} ${user?.lastName}`,
      },
      callback_url: `${process.env.BACKEND_URL}/webhooks/flutterwave`,
      redirect_url: `${process.env.NEXT_PUBLIC_API_URL}/dashboard`,
      customizations: {
        title: 'SyncPay sNGN Purchase',
        description: `Purchase ${amountNGN} sNGN`,
        logo: 'https://res.cloudinary.com/dgyqa6mb8/image/upload/v1767270534/logo_cfi08k.png',
      },
      meta: {
        transactionId: transaction.id,
        userId,
      },
      ...(paymentMethod === 'bank_transfer' &&
        bankCode && { bank_code: bankCode }),
    };

    // 4. Initialize Flutterwave payment
    const response = await axios.post(
      `${this.flutterwaveService.baseUrl}/payments`,
      payload,
      { headers: this.flutterwaveService.headers },
    );

    // 5. Update transaction with Flutterwave reference
    const currentMetadata = (transaction.metadata as Record<string, any>) || {};

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        metadata: {
          ...currentMetadata,
          flutterwaveReference: response.data.data.flw_ref,
          paymentLink: response.data.data.link,
        },
      },
    });

    return {
      success: true,
      data: {
        publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
        txRef,
        amount: amountNGN,
        currency: 'NGN',
        customer: {
          email: user?.email,
          name: `${user?.firstName} ${user?.lastName}`.trim(),
        },
        customizations: {
          title: 'SyncPay sNGN Purchase',
          description: `Purchase ${amountNGN} sNGN`,
          logo: 'https://res.cloudinary.com/dgyqa6mb8/image/upload/v1767270534/logo_cfi08k.png',
        },
        paymentLink: response.data.data.link,
      },
    };
  }

  async completeBuy(
    transactionId: string,
    metadata: { flutterwaveTransactionId: string; amountPaid: number },
  ) {
    try {
      // Fetch transaction to get user and amount
      const txRecord = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
      });
      if (!txRecord) throw new Error('Transaction not found');

      // Idempotency: if already completed, no action needed
      if (txRecord.status === 'COMPLETED') {
        console.warn(`Buy transaction ${transactionId} already completed`);
        return txRecord;
      }

      // 0. Ensure user has crypto wallet to receive minted tokens
      const wallets = await this.walletService.getCryptoWallets(
        txRecord.userId,
      );
      if (!wallets || wallets.length === 0) {
        throw new Error('User has no crypto wallet to receive minted tokens');
      }
      const cryptoWallet = wallets[0];

      // 1. Mint tokens on-chain to user's crypto wallet
      const smallestAmount = toSmallestUnit(txRecord.amount.toString(), 'sNGN');
      const mintResult = await this.tokenContractService.mintToken(
        cryptoWallet.address,
        smallestAmount.toString(),
        this.tokenContractService.sngnTokenAddress,
      );

      // 2. Update DB and credit user's internal balance inside a transaction
      return await this.prisma.$transaction(async (prisma) => {
        // Update transaction status
        const tx = await prisma.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            transactionHash: mintResult.transactionHash,
            metadata: {
              ...metadata,
              completedAt: new Date().toISOString(),
              mintTx: mintResult.transactionHash,
            },
          },
          include: { user: true },
        });

        // Credit user's sNGN balance
        if (this.balanceService) {
          await this.balanceService.creditAccount({
            userId: tx.userId,
            tokenSymbol: 'sNGN',
            amount: tx.amount,
            reference: `BUY-${tx.id}`,
            metadata: {
              type: 'BUY',
              source: 'FLUTTERWAVE',
              flutterwaveTxId: metadata.flutterwaveTransactionId,
              mintTx: mintResult.transactionHash,
            },
          });
        }

        // Log successful transaction
        await this.auditLogService.create({
          action: 'BUY_COMPLETED',
          entityType: 'Transaction',
          entityId: tx.id,
          user: {
            connect: { id: tx.userId },
          },
          metadata: {
            transactionId: tx.id,
            amount: tx.amount,
            currency: 'NGN',
            flutterwaveTxId: metadata.flutterwaveTransactionId,
            mintTx: mintResult.transactionHash,
          },
        });

        return tx;
      });
    } catch (error) {
      // Log the error
      await this.auditLogService.create({
        action: 'BUY_COMPLETION_FAILED',
        user: {
          connect: { id: transactionId },
        },
        metadata: {
          transactionId,
          error: error.message,
          flutterwaveTxId: metadata?.flutterwaveTransactionId,
        },
      });

      // Rethrow to allow the caller to handle the error
      throw error;
    }
  }

  async failBuy(
    transactionId: string,
    data: { status: string; failureReason: string },
  ) {
    try {
      const transaction = await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: data.status,
          metadata: {
            failureReason: data.failureReason,
            failedAt: new Date().toISOString(),
          },
        },
        include: { user: true },
      });

      await this.auditLogService.create({
        action: 'BUY_FAILED',
        user: {
          connect: { id: transaction.userId },
        },
        metadata: {
          transactionId,
          status: data.status,
          reason: data.failureReason,
        },
      });

      return transaction;
    } catch (error) {
      await this.auditLogService.create({
        action: 'BUY_FAILURE_HANDLING_FAILED',
        user: {
          connect: {
            id: transactionId,
          },
        },
        metadata: {
          transactionId,
          error: error.message,
        },
      });
      throw error;
    }
  }
}
