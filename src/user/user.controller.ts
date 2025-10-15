import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  Patch,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { Prisma, VerificationStatus } from '@prisma/client';
import { PaginationDto } from './dto/pagination.dto';
import { MonnifyService } from '../monnify/monnify.service';
import { ContractService } from 'src/contract/contract.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

interface JwtUser {
  userId: string;
  email: string;
  role: string;
}

interface RequestWithUser extends Request {
  user: JwtUser;
}

@Controller('user')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Users')
@ApiBearerAuth()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly monnifyService: MonnifyService,
    private readonly contractService: ContractService,
  ) {}

  @Public()
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    try {
      return await this.userService.createUser(createUserDto);
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error('Email already in use. Please use a different email or login.');
      } else if (error instanceof Prisma.PrismaClientValidationError) {
        throw new Error('Invalid user data. Please check your information and try again.');
      }
      
      throw new Error('Failed to create account. Please try again later.');
    }
  }

  @Get()
  @Roles('ADMIN')
  findAll(@Query() filter: UserFilterDto) {
    return this.userService.findAll(filter);
  }

  @Get(':id')
  async findById(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('fiatAccounts') fiatAccounts?: string,
    @Query('cryptoWallets') cryptoWallets?: string,
    @Query('transactions') transactions?: string,
    @Query('swapOrders') swapOrders?: string,
  ) {
    try {

      // Users can only access their own data, admins can access any user's data
      if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
        console.log('[UserController] Authorization failed - user can only access own data');
        throw new ForbiddenException('You can only access your own data');
      }

      const parseBoolean = (value?: string) => value === 'true';
      const include: Prisma.UserInclude = {
        fiatAccounts: parseBoolean(fiatAccounts),
        cryptoWallets: parseBoolean(cryptoWallets),
        transactions: parseBoolean(transactions),
        swapOrders: parseBoolean(swapOrders),
      };
      const user = await this.userService.getById(id, include);
      return { user };
    } catch (error) {
      console.error('[UserController] Error finding user by ID:', error);
      throw error;
    }
  }

  @Get('email/:email')
  @Roles('ADMIN')
  async getByEmail(@Param('email') email: string) {
    try {
      return await this.userService.getByEmail(email);
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw new Error('Failed to find user by email');
    }
  }

  @Get(':id/fiat-accounts')
  async getUserFiatAccounts(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only access your own data');
    }
    return await this.userService.getUserFiatAccounts(id, pagination);
  }

  @Get(':id/crypto-wallets')
  async getUserCryptoWallets(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only access your own data');
    }
    return await this.userService.getUserCryptoWallets(id, pagination);
  }

  @Get(':id/tx')
  async getUserTransactions(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only access your own data');
    }
    return await this.userService.getUserTransactions(id, pagination);
  }

  @Get('getUserByCryptoAddress/:address')
  @Roles('ADMIN')
  async getUserByCryptoAddress(@Param('address') address: string) {
    return this.userService.getUserByCryptoAddress(address);
  }

  @Get(':id/swap-orders')
  async getUserSwapOrders(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only access your own data');
    }
    return await this.userService.getUserSwapOrders(id, pagination);
  }

  @Patch(':id')
  async update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only update your own data');
    }
    return await this.userService.update(id, updateUserDto);
  }

  @Patch(':id/password')
  async updatePassword(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('password') password: string,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only update your own password');
    }
    return await this.userService.updatePassword(id, password);
  }

  // Payment PIN routes
  @Patch(':id/payment-pin')
  async setPaymentPin(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('pin') pin: string,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only set your own PIN');
    }
    return await this.userService.setPaymentPin(id, pin);
  }

  @Post(':id/payment-pin/verify')
  async verifyPaymentPin(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('pin') pin: string,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only verify your own PIN');
    }
    return await this.userService.verifyPaymentPin(id, pin);
  }

  @Patch(':id/payment-pin/change')
  async changePaymentPin(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('oldPin') oldPin: string,
    @Body('newPin') newPin: string,
  ) {
    if (req.user.role !== 'ADMIN' && req.user.userId !== id) {
      throw new ForbiddenException('You can only change your own PIN');
    }
    return await this.userService.changePaymentPin(id, oldPin, newPin);
  }

  @Patch(':id/verify-kyc')
  @Roles('ADMIN')
  async verifyKyc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: VerificationStatus,
    @Body('notes') notes?: string,
  ) {
    return await this.userService.verifyUserKyc(id, {
      verificationStatus: status,
      verificationNotes: notes,
    });
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.remove(id);
  }

  @Get('resolve/account/:accountNumber')
  async resolveAccount(@Param('accountNumber') accountNumber: string) {
    const syncAccount = await this.userService.resolveAccountNumber(accountNumber);
    const banks = await this.monnifyService.getNigerianBanks();

    if (syncAccount) {
      // SyncPayment account found - put it at the top
      return {
        syncAccount,
        banks: [
          { name: 'SyncPayment', code: 'SYNC001', isSyncPayment: true },
          ...banks,
        ],
      };
    }

    // Not a SyncPayment account - return just the banks
    return {
      syncAccount: null,
      banks,
    };
  }
}
