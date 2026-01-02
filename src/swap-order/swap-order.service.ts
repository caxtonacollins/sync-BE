import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { WalletService } from '../transaction/wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSwapOrderDto, SwapType } from '../types/dto/swap-order/create-swap-order.dto';
import { UpdateSwapOrderDto } from '../types/dto/swap-order/update-swap-order.dto';
import { SwapOrderFilterDto } from '../types/dto/swap-order/swap-order-filter.dto';
import { UserService } from 'src/user/user.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { LiquidityPoolContractService } from 'src/contract/services/liquidity-pool/liquidity-pool.service';
import { DexIntegrationService } from 'src/contract/services/dex/dex-integration.service';
import { FlutterwaveService } from 'src/payment/flutterwave/flutterwave.service';

@Injectable()
export class SwapOrderService {
  private readonly logger = new Logger(SwapOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly TokenContractService: TokenContractService,
    private readonly LiquidityPoolContractService: LiquidityPoolContractService,
    private readonly userService: UserService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly dexIntegrationService: DexIntegrationService,
  ) {}

  async create(dto: CreateSwapOrderDto) {
    return this.prisma.swapOrder.create({
      data: {
        ...dto,
        amount: new Prisma.Decimal(dto.amount),
        fee: dto.fee ? new Prisma.Decimal(dto.fee) : new Prisma.Decimal(0),
        rate: dto.rate ? new Prisma.Decimal(dto.rate) : null,
        status: dto.status || 'pending',
        swapType: dto.swapType,
        reference: dto.reference,
        userId: dto.userId,
        from: dto.from,
        to: dto.to,
      },
    });
  }

  async findAll(filter: SwapOrderFilterDto) {
    try {
      const { page = 1, limit = 10, ...where } = filter;
      const skip = (page - 1) * limit;
      const prismaWhere: Prisma.SwapOrderWhereInput = {};
      if (where.from) prismaWhere.from = where.from;
      if (where.to) prismaWhere.to = where.to;
      if (where.status) prismaWhere.status = where.status;
      if (where.userId) prismaWhere.userId = where.userId;
      if (where.minAmount || where.maxAmount) {
        prismaWhere.amount = {};
        if (where.minAmount) prismaWhere.amount.gte = where.minAmount;
        if (where.maxAmount) prismaWhere.amount.lte = where.maxAmount;
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


  private async executeTokenSwap(swapOrder: any) {
    const {
      id: swapOrderId,
      from,
      to,
      amount,
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
      from,
      cryptoWalletAddress,
    );

    if (parseFloat(balance) < amount) {
      throw new Error(
        `Insufficient token balance. Required: ${amount}, Available: ${balance}`,
      );
    }

    this.logger.log(
      `Initiating swap on StarkNet: ${amount} ${from} -> ${to}`,
    );

    const tokenTransferResult =
      await this.LiquidityPoolContractService.swapTokenToFiat(
        cryptoWalletAddress,
        to,
        from,
        amount,
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
      amount,
      from,
      toAmount,
      to,
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
    const feeAmount = (amount * feeToNumber) / 100;

    this.logger.log(
      `Charging ${amount} ${from} from user's fiat account`,
    );
    const amountToCharge = amount + feeAmount;
    await this.flutterwaveService.charge(user.id, amountToCharge, from);

    this.logger.log(
      `Successfully charged ${amount} ${from} from user ${userId}`,
    );

    this.logger.log(
      `Initiating swap on StarkNet: ${amount} ${from} -> ${to}`,
    );

    const tokenTransferResult =
      await this.LiquidityPoolContractService.swapFiatToToken(
        cryptoWalletAddress,
        from,
        to,
        amount,
        swapOrderId,
        toAmount,
        feeToNumber.toString(),
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

    try {
      // Initiate payout
      this.logger.log(
        `Initiating fiat payout of ${swapOrder.amount} ${swapOrder.from} to user ${swapOrder.userId}`,
      );

      const payoutResult = await this.flutterwaveService.initiatePayout(
        swapOrder.userId,
        Number(new Decimal(swapOrder.amount || 0).toNumber()),
        swapOrder.to,
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
      from,
      to,
      amount,
      userId,
    } = swapOrder;

    this.logger.log(
      `Executing DEX swap for order ${swapOrderId}: ${amount} ${from} -> ${to}`,
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
        from,
        to,
        amount,
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

  /**
   * Execute swap order - handles both token-to-token and stable token swaps
   */
  async executeSwap(dto: CreateSwapOrderDto) {
    this.logger.log(
      `Executing swap: ${dto.amount} ${dto.from} -> ${dto.to} for user ${dto.userId}`,
    );

    // Map frontend field names to backend field names if needed
    const from = dto.from.toUpperCase();
    const to = dto.to.toUpperCase();

    // Check if both are known tokens (including stable tokens)
    const isFromToken = this.isKnownToken(from);
    const isToToken = this.isKnownToken(to);

    if (!isFromToken || !isToToken) {
      throw new Error(
        `Unsupported token pair: ${from} -> ${to}. Both tokens must be supported.`,
      );
    }

    // Create swap order
    const swapOrder = await this.create({
      ...dto,
      from,
      to,
      reference: dto.reference || `SWAP_${Date.now()}_${dto.userId}`,
    });

    try {
      // Execute token-to-token swap (including stable tokens)
      await this.executeTokenToTokenSwap({
        ...swapOrder,
        toAmount: dto.toAmount,
      });

      return {
        id: swapOrder.id,
        status: swapOrder.status,
        transactionHash: swapOrder.transactionHash,
        message: 'Swap order created and execution initiated',
      };
    } catch (error) {
      this.logger.error(
        `Failed to execute swap ${swapOrder.id}: ${error.message}`,
        error.stack,
      );

      // Update order status to failed
      await this.update(swapOrder.id, {
        status: 'failed',
      });

      throw error;
    }
  }

  /**
   * Execute token-to-token swap (handles all tokens including stable tokens like sNGN)
   */
  private async executeTokenToTokenSwap(swapOrder: any) {
    const {
      id: swapOrderId,
      from,
      to,
      amount,
      toAmount,
      userId,
    } = swapOrder;

    this.logger.log(
      `Executing Token-to-Token swap: ${amount} ${from} -> ${toAmount || '?'} ${to}`,
    );

    const cryptoWallet = await this.walletService.getCryptoWallets(userId);
    if (!cryptoWallet || cryptoWallet.length === 0) {
      throw new Error('User does not have a crypto wallet');
    }

    const isRegisteredToLiquidity = cryptoWallet[0].isRegisteredToLiquidity;
    const cryptoWalletAddress = cryptoWallet[0].address;

    if (!isRegisteredToLiquidity) {
      throw new Error('User is not registered to contract');
    }

    // Check balance for the source token
    const balance = await this.TokenContractService.getAccountBalance(
      from,
      cryptoWalletAddress,
    );

    if (parseFloat(balance) < amount) {
      throw new Error(
        `Insufficient ${from} balance. Required: ${amount}, Available: ${balance}`,
      );
    }

    // Calculate fee
    const fee = await this.LiquidityPoolContractService.getFeeBPS();
    const feeToNumber = Number(fee);
    const feeAmount = (amount * feeToNumber) / 10000;

    // For stable tokens (sNGN) to other tokens, use swap_fiat_to_token
    // For other tokens to stable tokens, use swap_token_to_fiat
    // For token-to-token, we'll use the appropriate method based on which is stable
    const isFromStable = from === 'sNGN';
    const isToStable = to === 'sNGN';

    let tokenTransferResult;

    if (isFromStable && !isToStable) {
      // sNGN to token (e.g., sNGN -> USDC)
      this.logger.log(
        `Swapping stable token ${from} to token ${to} via swap_fiat_to_token`,
      );

      tokenTransferResult =
        await this.LiquidityPoolContractService.swapFiatToToken(
          cryptoWalletAddress,
          from, // fiatSymbol (sNGN)
          to, // tokenSymbol
          amount,
          swapOrderId,
          toAmount || amount, // estimated token amount
          feeToNumber.toString(),
        );
    } else if (!isFromStable && isToStable) {
      // Token to sNGN (e.g., USDC -> sNGN)
      this.logger.log(
        `Swapping token ${from} to stable token ${to} via swap_token_to_fiat`,
      );

      tokenTransferResult =
        await this.LiquidityPoolContractService.swapTokenToFiat(
          cryptoWalletAddress,
          to, // fiatSymbol (sNGN)
          from, // tokenSymbol
          amount.toString(),
          swapOrderId,
        );
    } else {
      // Token to token (e.g., USDC -> ETH)
      // Use swap_token_to_fiat first, then swap_fiat_to_token
      // Or use a direct token-to-token method if available
      // For now, we'll route through the liquidity pool
      this.logger.log(
        `Swapping token ${from} to token ${to} via liquidity pool`,
      );

      // For token-to-token swaps, we can use the same methods
      // by treating one as "fiat" in the contract context
      // But ideally, we should have a direct token-to-token swap
      // For MVP, we'll use swap_token_to_fiat with the target as "fiat"
      tokenTransferResult =
        await this.LiquidityPoolContractService.swapTokenToFiat(
          cryptoWalletAddress,
          to, // treated as fiat in contract
          from, // tokenSymbol
          amount.toString(),
          swapOrderId,
        );
    }

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

  private isKnownToken(tokenSymbol: string): boolean {
    const knownTokens = ['ETH', 'STRK', 'USDC', 'sNGN', 'SNGN', 'SYNC']; // Add sNGN
    return knownTokens.includes(tokenSymbol.toUpperCase());
  }
}
