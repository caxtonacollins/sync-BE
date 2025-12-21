import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { WalletService } from '../transaction/wallet/wallet.service';
import { TransactionService } from '../transaction/transaction.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSwapOrderDto, SwapType } from '../types/dto/swap-order/create-swap-order.dto';
import { UpdateSwapOrderDto } from '../types/dto/swap-order/update-swap-order.dto';
import { SwapOrderFilterDto } from '../types/dto/swap-order/swap-order-filter.dto';
import { UserService } from 'src/user/user.service';
import { PaymentService } from 'src/payment/payment.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { LiquidityPoolContractService } from 'src/contract/services/liquidity-pool/liquidity-pool.service';
import { DexIntegrationService } from 'src/contract/services/dex/dex-integration.service';

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
    private readonly dexIntegrationService: DexIntegrationService,
  ) {}

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
        if (where.fromDate)
          prismaWhere.createdAt.gte = new Date(where.fromDate);
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
      // Check liquidity and route to appropriate provider
      const routingResult = await this.dexIntegrationService.routeSwap(
        dto.fromCurrency,
        dto.toCurrency,
        dto.fromAmount,
        dto.swapType,
      );

      this.logger.log(
        `Swap routing decision: Provider=${routingResult.provider}, HasLiquidity=${routingResult.liquidityCheck.hasSufficientLiquidity}`,
      );

      // Update swap order with provider info
      await this.update(swapOrder.id, {
        metadata: {
          provider: routingResult.provider,
          liquidityCheck: {
            available: routingResult.liquidityCheck.availableLiquidity.toString(),
            required: routingResult.liquidityCheck.requiredLiquidity.toString(),
          },
        },
      });

      if (routingResult.provider === 'sync') {
        // Use Sync liquidity pool
        if (dto.swapType === SwapType.TOKENTOFIAT) {
          await this.executeTokenToFiatSwap(swapOrder);
        } else if (dto.swapType === SwapType.FIATTOTOKEN) {
          await this.executeFiatToTokenSwap(swapOrder);
        } else {
          throw new Error('Invalid swap type');
        }
      } else {
        // Route to external DEX (Uniswap or Starknet DEX)
        this.logger.log(
          `Routing swap to external DEX: ${routingResult.provider}`,
        );
        await this.executeDexSwap(swapOrder, routingResult);
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

    const balance = await this.TokenContractService.getAccountBalance(
      fromCurrency,
      cryptoWalletAddress,
    );

    if (parseFloat(balance) < fromAmount) {
      throw new Error(
        `Insufficient token balance. Required: ${fromAmount}, Available: ${balance}`,
      );
    }

    this.logger.log(
      `Initiating swap on StarkNet: ${fromAmount} ${fromCurrency} -> ${toCurrency}`,
    );

    const tokenTransferResult =
      await this.LiquidityPoolContractService.swapTokenToFiat(
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

    const {
      id: swapOrderId,
      userId,
      fromAmount,
      fromCurrency,
      toAmount,
      toCurrency,
    } = swapOrder;

    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const cryptoWallet = await this.walletService.getCryptoWallets(userId);
    if (!cryptoWallet || cryptoWallet.length === 0) {
      throw new Error(
        'User does not have a crypto wallet for receiving tokens',
      );
    }
    const isRegisteredToLiquidity = cryptoWallet[0].isRegisteredToLiquidity;
    const cryptoWalletAddress = cryptoWallet[0].address;

    if (!isRegisteredToLiquidity) {
      throw new Error('User is not registered to contract');
    }

    // calculate the fee to be paid
    const fee = await this.LiquidityPoolContractService.getFeeBPS();
    const feeToNumber = Number(fee);
    const feeAmount = (fromAmount * feeToNumber) / 100;

    this.logger.log(
      `Charging ${fromAmount} ${fromCurrency} from user's fiat account`,
    );
    const amountToCharge = fromAmount + feeAmount;
    await this.paymentService.charge(user.id, amountToCharge, fromCurrency);

    this.logger.log(
      `Successfully charged ${fromAmount} ${fromCurrency} from user ${userId}`,
    );

    this.logger.log(
      `Initiating swap on StarkNet: ${fromAmount} ${fromCurrency} -> ${toCurrency}`,
    );

    const tokenTransferResult =
      await this.LiquidityPoolContractService.swapFiatToToken(
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
      this.logger.log(
        `Swap order ${swapOrderId} is not a Token-to-Fiat swap. Skipping payout.`,
      );
      return;
    }

    try {
      // Initiate payout
      this.logger.log(
        `Initiating fiat payout of ${swapOrder.toAmount} ${swapOrder.toCurrency} to user ${swapOrder.userId}`,
      );

      const payoutResult = await this.paymentService.initiatePayout(
        swapOrder.userId,
        Number(new Decimal(swapOrder.toAmount || 0).toNumber()),
        swapOrder.toCurrency,
      );

      this.logger.log(
        `Payout initiated successfully for swap ${swapOrderId}. Reference: ${payoutResult.reference}`,
      );

      // TODO: Store payout reference in a separate PayoutRecord table if needed
      // For now, i just log it
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

  /**
   * Execute swap via external DEX (Uniswap or Starknet DEX)
   */
  private async executeDexSwap(swapOrder: any, routingResult: any) {
    const {
      id: swapOrderId,
      fromCurrency,
      toCurrency,
      fromAmount,
      userId,
    } = swapOrder;

    this.logger.log(
      `Executing DEX swap for order ${swapOrderId}: ${fromAmount} ${fromCurrency} -> ${toCurrency}`,
    );

    const cryptoWallet = await this.walletService.getCryptoWallets(userId);
    if (!cryptoWallet || cryptoWallet.length === 0) {
      throw new Error('User does not have a crypto wallet');
    }

    const cryptoWalletAddress = cryptoWallet[0].address;

    try {
      // Get quote from DEX
      const quote = routingResult.quote;
      if (!quote) {
        throw new Error('DEX quote not available');
      }

      // Execute swap via DEX
      // NOTE: This requires actual DEX integration
      // For Starknet, use JediSwap, Ekubo, or bridge to Ethereum for Uniswap
      const dexResult = await this.dexIntegrationService.executeDexSwap(
        cryptoWalletAddress,
        fromCurrency,
        toCurrency,
        fromAmount,
        quote.toAmount * 0.99, // 1% slippage tolerance
      );

      await this.update(swapOrder.id, {
        status: 'processing',
        transactionHash: dexResult.txHash,
        toAmount: quote.toAmount,
        fee: quote.fee,
      });

      this.logger.log(
        `DEX swap transaction sent: ${dexResult.txHash} for order ${swapOrderId}`,
      );
    } catch (error) {
      this.logger.error(
        `DEX swap execution failed for order ${swapOrderId}: ${error.message}`,
      );
      throw error;
    }
  }

  private isKnownToken(currency: string): boolean {
    const knownTokens = ['ETH', 'STRK', 'USDC', 'sNGN']; // Add sNGN
    return knownTokens.includes(currency.toUpperCase());
  }
}
