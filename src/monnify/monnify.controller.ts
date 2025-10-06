import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { MonnifyService } from './monnify.service';
import { User } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('monnify')
@UseGuards(JwtAuthGuard)
export class MonnifyController {
    constructor(private readonly monnifyService: MonnifyService) { }

    @Public()
    @Post('create')
    async create(@Body() body: { user: User }) {
        return this.monnifyService.createReserveAccount(body.user);
    }

    @Public()
    @Get(':id')
    async getDetails(@Query('id') userId: string) {
        return this.monnifyService.getReservedAccountDetails(userId);
    }

    @Get('banks/list')
    async getBanks() {
        return this.monnifyService.getNigerianBanks();
    }
}
