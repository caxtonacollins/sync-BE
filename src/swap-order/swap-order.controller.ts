import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { SwapOrderService } from './swap-order.service';
import { CreateSwapOrderDto } from './dto/create-swap-order.dto';
import { UpdateSwapOrderDto } from './dto/update-swap-order.dto';
import { SwapOrderFilterDto } from './dto/swap-order-filter.dto';

@Controller('swap-order')
export class SwapOrderController {
  constructor(private readonly swapOrderService: SwapOrderService) {}

  @Post()
  create(@Body() dto: CreateSwapOrderDto) {
    return this.swapOrderService.create(dto);
  }

  @Get()
  findAll(@Query() filter: SwapOrderFilterDto) {
    try {
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
