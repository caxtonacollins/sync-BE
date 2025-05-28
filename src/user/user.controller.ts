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
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { Prisma, VerificationStatus } from '@prisma/client';
import { PaginationDto } from './dto/pagination.dto';

@Controller('user')
// @ApiTags('Users')
// @UseInterceptors(ClassSerializerInterceptor)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    try {
      return await this.userService.createUser(createUserDto);
    } catch (error) {
      console.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  @Get()
  // @Roles(UserRole.ADMIN)
  // @ApiBearerAuth()
  findAll(@Query() filter: UserFilterDto) {
    return this.userService.findAll(filter);
  }

  @Get(':id')
  findById(
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

      return this.userService.getById(id, include);
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw new Error('Failed to find user by ID');
    }
  }

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

  @Get(':id/transactions')
  async getUserTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    return await this.userService.getUserTransactions(id, pagination);
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
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
