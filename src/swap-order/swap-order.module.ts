import { Module } from '@nestjs/common';
import { SwapOrderService } from './swap-order.service';
import { SwapOrderController } from './swap-order.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SwapOrderController],
  providers: [SwapOrderService],
})
export class SwapOrderModule {}
