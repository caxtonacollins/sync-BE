import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateBuyRequestDto } from 'src/types/dto/buy/buy-request.dto';
import { BuyService } from './buy.service';
import { RequestWithUser } from 'src/types';

@Controller('buy')
export class BuyController {
  constructor(private readonly buyService: BuyService) {}

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  async initiateBuy(
    @Req() req: RequestWithUser,
    @Body() createBuyDto: CreateBuyRequestDto,
  ) {
    return this.buyService.initiateBuy(req.user.userId, createBuyDto);
  }

  // @Post('webhook')
  // @HttpCode(200)
  // async handleWebhook(
  //   @Body() payload: any,
  //   @Headers('verif-hash') signature: string,
  // ) {
  //   return this.buyService.handleWebhook(payload, signature);
  // }
}
