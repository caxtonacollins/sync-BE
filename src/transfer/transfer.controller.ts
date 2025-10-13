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
    dto.userId = req.user.sub;
    return this.transferService.transferToken(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('fiat')
  transferFiat(@Body() dto: CreateTransferDto, @Req() req) {
    dto.userId = req.user.sub;
    return this.transferService.transferFiat(dto);
  }
}
