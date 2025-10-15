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
import { CreateSwapOrderDto } from './dto/create-swap-order.dto';
import { UpdateSwapOrderDto } from './dto/update-swap-order.dto';
import { SwapOrderFilterDto } from './dto/swap-order-filter.dto';
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
  create(@Body() dto: CreateSwapOrderDto) {
    dto.status = 'pending';
    return this.swapOrderService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('execute')
  execute(@Body() dto: CreateSwapOrderDto) {
    return this.swapOrderService.executeSwap(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query() filter: SwapOrderFilterDto, @Req() req: RequestWithUser) {
    try {
      // Ensure users can only access their own swap orders
      if (req.user.role !== 'ADMIN' && filter.userId && req.user.userId !== filter.userId) {
        throw new ForbiddenException('You can only access your own swap orders');
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
}
