import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WalletService } from '../wallet/wallet.service';
import { TransactionService } from '../transaction/transaction.service';
import { ContractService } from '../contract/contract.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSwapOrderDto, SwapType } from './dto/create-swap-order.dto';
import { UpdateSwapOrderDto } from './dto/update-swap-order.dto';
import { SwapOrderFilterDto } from './dto/swap-order-filter.dto';
import { Prisma } from '@prisma/client';
import { UserService } from 'src/user/user.service';
import { PaymentService } from 'src/payment/payment.service';
import { uint256 } from 'starknet';
import { parseTokenAmount } from 'libs/utils';
import { RegistrationStatus } from 'src/types';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
    private readonly contractService: ContractService,
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
    // TODO: more validation here (e.g., check if currencies are supported)
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

  /**
   * Execute Token-to-Fiat swap
   * Step 1: Validate user and balances
   * Step 2: Initiate swap on StarkNet contract
   * Step 3: Update order status to 'processing'
   * Step 4: Wait for event confirmation (handled by LiquidityEventProcessorService)
   * Step 5: Payout is triggered by event handler after confirmation
   */
  private async executeTokenToFiatSwap(swapOrder: any) {
    const {
      id: swapOrderId,
      fromCurrency,
      toCurrency,
      fromAmount,
      userId,
    } = swapOrder;
    this.logger.log(`Executing Token-to-Fiat swap for order ${swapOrder.id}`);

    // const fromAmountBigInt = parseTokenAmount(fromAmount, 18);
    // console.log('fromAmountBigInt', fromAmountBigInt);

    // Step 1: Validate user registration and account status
    const cryptoWallet = await this.walletService.getCryptoWallets(userId);
    if (!cryptoWallet || cryptoWallet.length === 0) {
      throw new Error('User does not have a crypto wallet');
    }

    const userOnchainDashboardData = await this.contractService.getUserDashboardData(userId);
    const { isRegistered,
      accountAddress,
    } = userOnchainDashboardData as RegistrationStatus;

    if (!isRegistered) {
      throw new Error('User is not registered to contract');
    }

    if (cryptoWallet[0].address !== accountAddress) {
      throw new Error('User wallet address does not match contract address');
    }

    // Step 2: Verify token balance
    const balance = await this.contractService.getAccountBalance(fromCurrency, accountAddress);
    this.logger.log(`User balance: ${balance.formatted} ${fromCurrency}`);

    if (parseFloat(balance.formatted) < fromAmount) {
      throw new Error(`Insufficient token balance. Required: ${fromAmount}, Available: ${balance.formatted}`);
    }

    // Step 3: Verify user has fiat account for payout
    const fiatAccount = await this.walletService.getFiatAccountForUser(userId);
    if (!fiatAccount) {
      throw new Error('User does not have a fiat account for payout');
    }

    // Step 4: Initiate swap transaction on StarkNet
    this.logger.log(`Initiating swap on StarkNet: ${fromAmount} ${fromCurrency} -> ${toCurrency}`);

    const tokenTransferResult = await this.contractService.swapTokenToFiat(
      accountAddress,
      toCurrency,
      fromCurrency,
      fromAmount,
      swapOrderId,
    );

    this.logger.log(
      `Token swap transaction sent: ${tokenTransferResult.txHash}`,
    );

    // Step 5: Update order status to 'processing'
    // The swap is now on-chain, waiting for confirmation
    await this.update(swapOrder.id, {
      status: 'processing',
      transactionHash: tokenTransferResult.txHash,
    });

    this.logger.log(
      `Swap order ${swapOrder.id} is now processing. Waiting for StarkNet event confirmation...`,
    );
  }

  /**
   * Execute Fiat-to-Token swap
   * Step 1: Validate user and fiat account
   * Step 2: Verify/charge fiat balance
   * Step 3: Initiate swap on StarkNet contract
   * Step 4: Update order status to 'processing'
   * Step 5: Wait for event confirmation (handled by LiquidityEventProcessorService)
   */
  private async executeFiatToTokenSwap(swapOrder: any) {
    this.logger.log(`Executing Fiat-to-Token swap for order ${swapOrder.id}`);

    const { id: swapOrderId, userId, fromAmount, fromCurrency, toAmount, toCurrency } = swapOrder;

    // Step 1: Validate user
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Step 2: Validate fiat account
    const fiatAccount = await this.walletService.getFiatAccountForUser(userId);
    if (!fiatAccount) {
      throw new Error('User does not have a fiat account for payment');
    }

    // Step 3: Verify crypto wallet
    const cryptoWallet = await this.walletService.getCryptoWallets(userId);
    if (!cryptoWallet || cryptoWallet.length === 0) {
      throw new Error('User does not have a crypto wallet for receiving tokens');
    }

    // Step 4: Check and charge fiat balance
    // TODO: Implement actual balance check with Flutterwave
    const balance = await this.paymentService.getAccountBalance(fiatAccount);
    if (balance < fromAmount) {
      throw new Error(`Insufficient fiat balance. Required: ${fromAmount}, Available: ${balance}`);
    }

    this.logger.log(`Charging ${fromAmount} ${fromCurrency} from user's fiat account`);
    await this.paymentService.charge(fiatAccount, fromAmount, fromCurrency);

    this.logger.log(
      `Successfully charged ${fromAmount} ${fromCurrency} from user ${userId}`,
    );

    // Step 5: Initiate swap transaction on StarkNet
    this.logger.log(`Initiating swap on StarkNet: ${fromAmount} ${fromCurrency} -> ${toCurrency}`);

    const tokenTransferResult = await this.contractService.swapFiatToToken(
      cryptoWallet[0].address,
      fromCurrency,
      toCurrency,
      fromAmount,
      swapOrderId,
    );

    this.logger.log(
      `Token transfer transaction sent: ${tokenTransferResult.transactionHash}`,
    );

    // Step 6: Update order status to 'processing'
    await this.update(swapOrder.id, {
      status: 'processing',
      transactionHash: tokenTransferResult.transactionHash,
    });

    this.logger.log(
      `Swap order ${swapOrder.id} is now processing. Waiting for StarkNet event confirmation...`,
    );

    // NOTE: Order completion will be triggered automatically by LiquidityEventProcessorService
    // when it receives the FiatToTokenSwapExecuted event from StarkNet.
    // See: liquidity-event-processor.service.ts -> handleFiatToTokenSwap()
  }

  /**
   * Initiate payout for a confirmed swap
   * This is called by the event processor after receiving swap confirmation from StarkNet
   */
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
        swapOrder.toAmount || 0,
        swapOrder.toCurrency,
      );

      this.logger.log(
        `Payout initiated successfully for swap ${swapOrderId}. Reference: ${payoutResult.reference}`,
      );

      // TODO: Store payout reference in a separate PayoutRecord table if needed
      // For now, we just log it
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
