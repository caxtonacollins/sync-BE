import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TransferService } from 'src/transfer/transfer.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfer')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @UseGuards(JwtAuthGuard)
  @Post('token')
  transferToken(@Body() dto: CreateTransferDto, @Req() req) {
    return this.transferService.transferToken(dto, req.user.userId as string);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fiat')
  transferFiat(@Body() dto: CreateTransferDto, @Req() req) {
    return this.transferService.transferFiat(dto, req.user.userId as string);
  }
}
