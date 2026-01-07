import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WalletService } from '../transaction/wallet/wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { SwapOrderDto } from '../types/dto/swap-order/create-swap-order.dto';
import { UpdateSwapOrderDto } from '../types/dto/swap-order/update-swap-order.dto';
import { SwapOrderFilterDto } from '../types/dto/swap-order/swap-order-filter.dto';
import { UserService } from 'src/user/user.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { LiquidityPoolContractService } from 'src/contract/services/liquidity-pool/liquidity-pool.service';
import { DexIntegrationService } from 'src/contract/services/dex/dex-integration.service';
import { FlutterwaveService } from 'src/payment/flutterwave/flutterwave.service';
import { convertToWei } from 'src/contract/helpers/utils.helper';

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

  async create(dto: SwapOrderDto) {
    return this.prisma.swapOrder.create({
      data: {
        ...dto,
        amount: new Prisma.Decimal(dto.amount),
        toAmount: new Prisma.Decimal(dto.toAmount),
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
  }

  async findOne(id: string) {
    return await this.prisma.swapOrder.findUnique({ where: { id } });
  }

  async update(id: string, dto: UpdateSwapOrderDto) {
    const { userId, metadata, ...rest } = dto;

    const updateData: Prisma.SwapOrderUpdateInput = {
      ...rest,
      ...(userId ? { userId: String(userId) } : {}),
      ...(metadata
        ? {
          metadata: JSON.parse(JSON.stringify(metadata)),
        }
        : {}),
    };

    return this.prisma.swapOrder.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    return await this.prisma.swapOrder.delete({ where: { id } });
  }

  async swap(swapOrder: SwapOrderDto) {
    const { from, to, amount, userId, id: swapOrderId } = swapOrder;

    const newSwapOrder = await this.create(swapOrder);

    swapOrder.id = newSwapOrder.id;

    try {
    // Get user's crypto wallet address
      const cryptoWallet = await this.walletService.getCryptoWallets(userId);
      if (!cryptoWallet || cryptoWallet.length === 0) {
        throw new Error('User does not have a crypto wallet');
      }

      // const cryptoWalletAddress = cryptoWallet[0].address;

      // Calculate deadline (e.g., 30 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes from now

      // Get token addresses
      const fromTokenAddress = this.TokenContractService.getTokenAddress(from);
      const toTokenAddress = this.TokenContractService.getTokenAddress(to);

      if (!fromTokenAddress || !toTokenAddress) {
        throw new Error('Invalid token addresses');
      }

      // Calculate minimum expected output (with 1% slippage)
      const fromDecimals = this.TokenContractService.getTokenDecimals(from);

      const fromAmountWei = convertToWei(amount.toString(), fromDecimals);

      // Get expected output from the contract
      const expectedOutput =
        await this.LiquidityPoolContractService.calculateSwapAmount(
          fromTokenAddress,
          toTokenAddress,
          fromAmountWei.toString(),
        );

      // Apply 1% slippage tolerance
      const minToAmount = (BigInt(expectedOutput) * 99n) / 100n; // 1% slippage

      // Create swap in the liquidity bridge
      const swapResult = await this.LiquidityPoolContractService.createSwap(
        fromTokenAddress,
        toTokenAddress,
        fromAmountWei.toString(),
        minToAmount.toString(),
        deadline,
      );

      // Update swap order with transaction details
      await this.update(swapOrder.id!, {
        status: 'pending',
        transactionHash: swapResult.txHash,
        metadata: {
          provider: 'liquidity-bridge',
          liquidityCheck: {
            available: '0',
            required: '0',
          },
          ...(swapOrder.metadata || {}),
          minToAmount: swapResult.details.minToAmount.toString(),
          deadline,
        },
      });

      return {
        ...swapResult,
        swapOrderId,
        status: 'pending',
      };
    } catch (error) {
      this.logger.error(`Swap failed: ${error.message}`, error.stack);
      await this.update(swapOrder.id!, {
        status: 'failed',
        metadata: {
          error: error.message,
        },
      });
      throw error;
    }
  }

  async executeSwap(dto: SwapOrderDto) {
    try {
      // Get the swap order
      const swapOrder = await this.create(dto);

      dto.id = swapOrder.id;

      // Check if swap is already completed or failed
      if (['completed', 'failed', 'cancelled'].includes(swapOrder.status)) {
        throw new Error(`Cannot execute swap with status: ${swapOrder.status}`);
      }

      // Get the swap ID from metadata with proper type assertion
      const metadata = swapOrder.metadata as {
        swapId?: string;
        minToAmount?: string;
      } | null;
      const swapId = metadata?.swapId;

      if (!swapId) {
        throw new Error('No swap ID found for this order');
      }

      // Execute the swap
      const result = await this.LiquidityPoolContractService.executeSwap(
        Number(swapId),
      );

      // Update swap order status
      await this.update(swapOrder.id, {
        status: 'completed',
        completedAt: new Date(),
        transactionHash: result.txHash,
      });

      return {
        ...result,
        id: swapOrder.id,
        status: 'completed',
      };
    } catch (error) {
      this.logger.error(`Execute swap failed: ${error.message}`, error.stack);
      await this.update(dto.id!, {
        metadata: {
          error: error.message,
        },
        status: 'failed',
      });
      throw error;
    }
  }
}
