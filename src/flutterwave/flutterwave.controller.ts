import { Controller, Post, Body, UseGuards, Get, Query, Param, Delete, Put } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { User } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

class UpdateBVNDto {
  bvn: string;
}

@Controller('flutterwave')
// @UseGuards(JwtAuthGuard)
export class FlutterwaveController {
  constructor(private readonly flutterwaveService: FlutterwaveService) {}

  @Post('create-virtual-accounts')
  async createVirtualAccounts(@Body() user: User) {
    return this.flutterwaveService.createVirtualAccounts(user);
  }

  @Get('get-virtual-account')
  async getVirtualAccount(@Query('ref') ref: string) {
    return this.flutterwaveService.getVirtualAccount(ref);
  }

  @Put('virtual-account/:orderRef/bvn')
  async updateBVN(
    @Param('orderRef') orderRef: string,
    @Body() updateBVNDto: UpdateBVNDto
  ) {
    return this.flutterwaveService.updateBVN(orderRef, updateBVNDto.bvn);
  }

  @Delete('virtual-account/:orderRef')
  async deleteVirtualAccount(@Param('orderRef') orderRef: string) {
    return this.flutterwaveService.deleteVirtualAccount(orderRef);
  }
}
