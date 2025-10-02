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
import { Public } from '../auth/decorators/public.decorator';

@Controller('user')
@UseGuards(JwtAuthGuard)
// @ApiTags('Users')
// @UseInterceptors(ClassSerializerInterceptor)
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
  // @Roles(UserRole.ADMIN)
  // @ApiBearerAuth()
  findAll(@Query() filter: UserFilterDto) {
    return this.userService.findAll(filter);
  }

  @Public()
  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('fiatAccounts') fiatAccounts?: string,
    @Query('cryptoWallets') cryptoWallets?: string,
    @Query('transactions') transactions?: string,
    @Query('swapOrders') swapOrders?: string,
  ) {
    try {
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
      console.error('Error finding user by ID:', error);
      throw new Error('Failed to find user by ID');
    }
  }

  @Public()
  @Get('email/:email')
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
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return await this.userService.getUserFiatAccounts(id, pagination);
  }

  @Get(':id/crypto-wallets')
  async getUserCryptoWallets(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return await this.userService.getUserCryptoWallets(id, pagination);
  }

  @Get(':id/tx')
  async getUserTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return await this.userService.getUserTransactions(id, pagination);
  }

  @Public()
  @Get('getUserByCryptoAddress/:address')
  async getUserByCryptoAddress(@Param('address') address: string) {
    return this.userService.getUserByCryptoAddress(address);
  }

  @Get(':id/swap-orders')
  async getUserSwapOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return await this.userService.getUserSwapOrders(id, pagination);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return await this.userService.update(id, updateUserDto);
  }

  @Patch(':id/password')
  async updatePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('password') password: string,
  ) {
    return await this.userService.updatePassword(id, password);
  }

  @Patch(':id/verify-kyc')
  // @Roles(UserRole.ADMIN, UserRole.USER)
  // @ApiBearerAuth()
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
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.remove(id);
  }
}
