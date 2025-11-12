import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { WalletService } from '../wallet/wallet.service';
import { TransactionService } from '../transaction/transaction.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSwapOrderDto, SwapType } from './dto/create-swap-order.dto';
import { UpdateSwapOrderDto } from './dto/update-swap-order.dto';
import { SwapOrderFilterDto } from './dto/swap-order-filter.dto';
import { UserService } from 'src/user/user.service';
import { PaymentService } from 'src/payment/payment.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { LiquidityPoolContractService } from 'src/contract/services/liquidity-pool/liquidity-pool.service';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
    private readonly TokenContractService: TokenContractService,
    private readonly LiquidityPoolContractService: LiquidityPoolContractService,
    private readonly userService: UserService,
    private readonly paymentService: PaymentService,
  ) { }

  async create(dto: CreateSwapOrderDto) {
    return this.prisma.swapOrder.create({
      data: { ...dto, fee: dto.fee ?? 0 },
    });
  }

  async findAll(filter: SwapOrderFilterDto) {
    try {
      const { page = 1, limit = 10, ...where } = filter;
      const skip = (page - 1) * limit;
      const prismaWhere: Prisma.SwapOrderWhereInput = {};
      if (where.fromCurrency) prismaWhere.fromCurrency = where.fromCurrency;
      if (where.toCurrency) prismaWhere.toCurrency = where.toCurrency;
      if (where.status) prismaWhere.status = where.status;
      if (where.userId) prismaWhere.userId = where.userId;
      if (where.minAmount || where.maxAmount) {
        prismaWhere.fromAmount = {};
        if (where.minAmount) prismaWhere.fromAmount.gte = where.minAmount;
        if (where.maxAmount) prismaWhere.fromAmount.lte = where.maxAmount;
      }

      if (where.fromDate || where.toDate) {
        prismaWhere.createdAt = {};
        if (where.fromDate) prismaWhere.createdAt.gte = new Date(where.fromDate);
        if (where.toDate) prismaWhere.createdAt.lte = new Date(where.toDate);
      }

      const [data, total] = await Promise.all([
        await this.prisma.swapOrder.findMany({
          where: prismaWhere,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.swapOrder.count({ where: prismaWhere }),
      ]);
      return { data, total, page, limit };
    } catch (error) {
      throw error;
    }
  }

  async findOne(id: string) {
    return await this.prisma.swapOrder.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateSwapOrderDto) {
    const { userId, ...rest } = dto;
    const updateData: Prisma.SwapOrderUpdateInput = {
      ...rest,
      ...(userId ? { userId: String(userId) } : {}),
    };

    return this.prisma.swapOrder.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    return await this.prisma.swapOrder.delete({ where: { id } });
  }

  async executeSwap(dto: CreateSwapOrderDto) {
    const swapOrder = await this.create(dto);

    try {
      if (dto.swapType === SwapType.TOKENTOFIAT) {
        await this.executeTokenToFiatSwap(swapOrder);
      } else if (dto.swapType === SwapType.FIATTOTOKEN) {
        await this.executeFiatToTokenSwap(swapOrder);
      } else {
        throw new Error('Invalid swap type');
      }
    } catch (error) {
      this.logger.error(`Swap execution failed for order ${swapOrder.id}`);
      await this.update(swapOrder.id, { status: 'failed' });
      throw error;
    }

    return swapOrder;
  }

  private async executeTokenToFiatSwap(swapOrder: any) {
    const {
      id: swapOrderId,
      fromCurrency,
      toCurrency,
      fromAmount,
      userId,
    } = swapOrder;
    this.logger.log(`Executing Token-to-Fiat swap for order ${swapOrder.id}`);

    const cryptoWallet = await this.walletService.getCryptoWallets(userId);
    if (!cryptoWallet || cryptoWallet.length === 0) {
      throw new Error('User does not have a crypto wallet');
    }

    const isRegisteredToLiquidity = cryptoWallet[0].isRegisteredToLiquidity;
    const cryptoWalletAddress = cryptoWallet[0].address;

    if (!isRegisteredToLiquidity) {
      throw new Error('User is not registered to contract');
    }

    const balance = await this.TokenContractService.getAccountBalance(fromCurrency, cryptoWalletAddress);

    if (parseFloat(balance) < fromAmount) {
      throw new Error(`Insufficient token balance. Required: ${fromAmount}, Available: ${balance}`);
    }

    this.logger.log(`Initiating swap on StarkNet: ${fromAmount} ${fromCurrency} -> ${toCurrency}`);

    const tokenTransferResult = await this.LiquidityPoolContractService.swapTokenToFiat(
      cryptoWalletAddress,
      toCurrency,
      fromCurrency,
      fromAmount,
      swapOrderId,
    );

    this.logger.log(
      `Token swap transaction sent: ${tokenTransferResult.txHash}`,
    );

    await this.update(swapOrder.id, {
      status: 'processing',
      transactionHash: tokenTransferResult.txHash,
    });

    this.logger.log(
      `Swap order ${swapOrder.id} is now processing. Waiting for StarkNet event confirmation...`,
    );
  }

  private async executeFiatToTokenSwap(swapOrder: any) {
    this.logger.log(`Executing Fiat-to-Token swap for order ${swapOrder.id}`);

    const { id: swapOrderId, userId, fromAmount, fromCurrency, toAmount, toCurrency } = swapOrder;

    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const fiatAccount = await this.walletService.getFiatAccountForUser(userId);
    if (!fiatAccount) {
      throw new Error('User does not have a fiat account for payment');
    }

    const cryptoWallet = await this.walletService.getCryptoWallets(userId);
    if (!cryptoWallet || cryptoWallet.length === 0) {
      throw new Error('User does not have a crypto wallet for receiving tokens');
    }
    const isRegisteredToLiquidity = cryptoWallet[0].isRegisteredToLiquidity;
    const cryptoWalletAddress = cryptoWallet[0].address;

    if (!isRegisteredToLiquidity) {
      throw new Error('User is not registered to contract');
    }


    const fiatBalance = await this.paymentService.getAccountBalance(fiatAccount);

    if (fiatBalance < fromAmount) {
      throw new Error(`Insufficient fiat balance. Required: ${fromAmount}, Available: ${fiatBalance}`);
    }

    // calculate the fee to be paid
    const fee = await this.LiquidityPoolContractService.getFeeBPS();
    const feeToNumber = Number(fee);
    const feeAmount = fromAmount * feeToNumber / 100; 

    this.logger.log(`Charging ${fromAmount} ${fromCurrency} from user's fiat account`);
    const amountToCharge = fromAmount + feeAmount;
    await this.paymentService.charge(fiatAccount, amountToCharge, fromCurrency);

    this.logger.log(
      `Successfully charged ${fromAmount} ${fromCurrency} from user ${userId}`,
    );

    this.logger.log(`Initiating swap on StarkNet: ${fromAmount} ${fromCurrency} -> ${toCurrency}`);

    const tokenTransferResult = await this.LiquidityPoolContractService.swapFiatToToken(
      cryptoWalletAddress,
      fromCurrency,
      toCurrency,
      fromAmount,
      swapOrderId,
      toAmount,
      feeToNumber,
    );

    this.logger.log(
      `Token transfer transaction sent: ${tokenTransferResult.txHash}`,
    );

    // Step 6: Update order status to 'processing'
    await this.update(swapOrder.id, {
      status: 'processing',
      transactionHash: tokenTransferResult.txHash,
    });

    this.logger.log(
      `Swap order ${swapOrder.id} is now processing. Waiting for StarkNet event confirmation...`,
    );
  }

  async initiatePayoutForSwap(swapOrderId: string) {
    this.logger.log(`Initiating payout for swap order ${swapOrderId}`);

    const swapOrder = await this.findOne(swapOrderId);
    if (!swapOrder) {
      throw new NotFoundException(`Swap order ${swapOrderId} not found`);
    }

    if (swapOrder.status !== 'completed') {
      this.logger.warn(
        `Swap order ${swapOrderId} is not in completed status. Current status: ${swapOrder.status}`,
      );
      return;
    }

    if (swapOrder.swapType !== 'TOKENTOFIAT') {
      this.logger.log(`Swap order ${swapOrderId} is not a Token-to-Fiat swap. Skipping payout.`);
      return;
    }

    try {
      const fiatAccount = await this.walletService.getFiatAccountForUser(swapOrder.userId);
      if (!fiatAccount) {
        throw new Error('User does not have a fiat account for payout');
      }

      // Initiate payout
      this.logger.log(
        `Initiating fiat payout of ${swapOrder.toAmount} ${swapOrder.toCurrency} to user ${swapOrder.userId}`,
      );
 
      const payoutResult = await this.paymentService.initiatePayout(
        fiatAccount,
        Number(new Decimal(swapOrder.toAmount || 0).toNumber()),
        swapOrder.toCurrency,
      );

      this.logger.log(
        `Payout initiated successfully for swap ${swapOrderId}. Reference: ${payoutResult.reference}`
      );

      // TODO: Store payout reference in a separate PayoutRecord table if needed
      // For now, will just log it
    } catch (error) {
      this.logger.error(
        `Failed to initiate payout for swap ${swapOrderId}: ${error.message}`,
        error.stack,
      );

      // Update swap order to indicate payout failure
      await this.update(swapOrderId, {
        status: 'payout_failed',
      });

      throw error;
    }
  }

  private isKnownToken(currency: string): boolean {
    const knownTokens = ['ETH', 'STRK', 'USDC']; // Add more as needed
    return knownTokens.includes(currency.toUpperCase());
  }
}
