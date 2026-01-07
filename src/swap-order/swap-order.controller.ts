import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SwapOrderService } from './swap-order.service';
import { SwapOrderDto, SwapType } from '../types/dto/swap-order/create-swap-order.dto';
import { UpdateSwapOrderDto } from '../types/dto/swap-order/update-swap-order.dto';
import { SwapOrderFilterDto } from '../types/dto/swap-order/swap-order-filter.dto';
import { Request } from 'express';

interface JwtUser {
  userId: string;
  email: string;
  role: string;
}

interface RequestWithUser extends Request {
  user: JwtUser;
}

@Controller('swap-order')
export class SwapOrderController {
  constructor(private readonly swapOrderService: SwapOrderService) {}

  @Post()
  create(@Body() dto: SwapOrderDto) {
    dto.status = 'pending';
    return this.swapOrderService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query() filter: SwapOrderFilterDto, @Req() req: RequestWithUser) {
    try {
      // Ensure users can only access their own swap orders
      if (
        req.user.role !== 'ADMIN' &&
        filter.userId &&
        req.user.userId !== filter.userId
      ) {
        throw new ForbiddenException(
          'You can only access your own swap orders',
        );
      }

      // For non-admin users, force filter by their own userId
      if (req.user.role !== 'ADMIN') {
        filter.userId = req.user.userId;
      }

      return this.swapOrderService.findAll(filter);
    } catch (error) {
      throw error;
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.swapOrderService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSwapOrderDto) {
    return this.swapOrderService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.swapOrderService.remove(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('execute')
  async execute(@Body() body: any, @Req() req: RequestWithUser) {
    // Map frontend payload to backend DTO format
    const dto: SwapOrderDto = {
      from: body.from,
      to: body.to,
      amount: body.fromAmount || body.amount,
      toAmount: body.toAmount ?? body.estimated,
      rate: body.rate,
      fee: body.fee || 0,
      status: body.status || 'pending',
      userId: body.userId || req.user.userId,
      reference: body.reference,
      swapType: body.swapType || SwapType.MARKET,
      metadata: body.metadata,
    };

    // Ensure users can only execute swaps for themselves
    if (req.user.role !== 'ADMIN' && dto.userId !== req.user.userId) {
      throw new ForbiddenException(
        'You can only execute swaps for your own account',
      );
    }

    return this.swapOrderService.executeSwap(dto);
  }
}
