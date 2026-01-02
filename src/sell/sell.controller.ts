import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { SellService } from './sell.service';
import { CreateSellRequestDto } from 'src/types/dto/sell/create-sell-request.dto';
import { RequestWithUser } from 'src/types';

@Controller('sell')
export class SellController {
  constructor(private readonly sellService: SellService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  async initiateSell(
    @Req() req: RequestWithUser,
    @Body() dto: CreateSellRequestDto,
  ) {
    const userId = req.user?.userId;
    return await this.sellService.initiateSell(userId, dto);
  }
}
