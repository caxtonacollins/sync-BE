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
  BadRequestException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Prisma, VerificationStatus } from '@prisma/client';
import { PaginationDto } from './dto/pagination.dto';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { ContractService } from 'src/contract/contract.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

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
    private readonly flutterwaveService: FlutterwaveService,
    private readonly contractService: ContractService,
  ) {}

  @Public()
  @Post()
  @ApiOperation({
    summary: 'Create new user account',
    description: 'Creates a new user account with the provided details',
  })
  @ApiResponse({
    status: 201,
    description: 'User successfully created',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid data or email already in use',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Email already in use',
        },
        field: {
          type: 'string',
          example: 'email',
        },
        error: {
          type: 'string',
          example:
            'Email already in use. Please use a different email or login.',
        },
      },
    },
  })
  async create(@Body() createUserDto: CreateUserDto) {
    try {
      return await this.userService.createUser(createUserDto);
    } catch (error) {
      if (error.code === 'P2002') {
        throw new BadRequestException({
          message: 'Email already in use',
          field: 'email',
          error: 'Email already in use. Please use a different email or login.',
        });
      } else if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException(
          'Invalid user data. Please check your information and try again.',
        );
      }

      throw new BadRequestException(
        'Failed to create account. Please try again later.',
      );
    }
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieves a list of all users. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of users retrieved successfully',
    type: [CreateUserDto],
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires admin role',
  })
  findAll(@Query() filter: UserFilterDto) {
    return this.userService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description:
      'Retrieves user details by ID. Users can only access their own data, admins can access any user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User found and data retrieved successfully',
    type: CreateUserDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Cannot access other user data unless admin',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'fiatAccounts',
    required: false,
    type: 'boolean',
    description: 'Include fiat accounts in response',
  })
  @ApiQuery({
    name: 'cryptoWallets',
    required: false,
    type: 'boolean',
    description: 'Include crypto wallets in response',
  })
  @ApiQuery({
    name: 'transactions',
    required: false,
    type: 'boolean',
    description: 'Include transactions in response',
  })
  @ApiQuery({
    name: 'swapOrders',
    required: false,
    type: 'boolean',
    description: 'Include swap orders in response',
  })
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
        console.log(
          '[UserController] Authorization failed - user can only access own data',
        );
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
  @ApiOperation({
    summary: 'Get user by email',
    description: 'Retrieves user details by email address. Admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'User found successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires admin role',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiParam({
    name: 'email',
    description: 'User email address',
    type: 'string',
    format: 'email',
  })
  async getByEmail(@Param('email') email: string) {
    try {
      return await this.userService.getByEmail(email);
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw new Error('Failed to find user by email');
    }
  }

  @Get(':id/fiat-accounts')
  @ApiOperation({
    summary: 'Get user fiat accounts',
    description:
      'Retrieves list of fiat accounts for a specific user. Users can only access their own data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Fiat accounts retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              accountNumber: { type: 'string' },
              bankName: { type: 'string' },
              currency: { type: 'string' },
              balance: { type: 'number' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Can only access own data',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
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
  @ApiOperation({
    summary: 'Get user crypto wallets',
    description:
      'Retrieves list of crypto wallets for a specific user. Users can only access their own data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Crypto wallets retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              address: { type: 'string' },
              network: { type: 'string' },
              balance: { type: 'string' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Can only access own data',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
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
  @ApiOperation({
    summary: 'Get user transactions',
    description:
      'Retrieves list of transactions for a specific user. Users can only access their own data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              type: {
                type: 'string',
                enum: ['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'],
              },
              amount: { type: 'number' },
              currency: { type: 'string' },
              status: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Can only access own data',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
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
  @ApiOperation({
    summary: 'Get user by crypto address',
    description:
      'Retrieves user details by their crypto wallet address. Admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'User found successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Requires admin role',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiParam({
    name: 'address',
    description: 'Crypto wallet address',
    type: 'string',
  })
  async getUserByCryptoAddress(@Param('address') address: string) {
    return this.userService.getUserByCryptoAddress(address);
  }

  @Get(':id/swap-orders')
  @ApiOperation({
    summary: 'Get user swap orders',
    description:
      'Retrieves list of swap orders for a specific user. Users can only access their own data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swap orders retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              fromAmount: { type: 'string' },
              fromCurrency: { type: 'string' },
              toAmount: { type: 'string' },
              toCurrency: { type: 'string' },
              status: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Can only access own data',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
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
  @ApiOperation({
    summary: 'Update user details',
    description:
      'Update user information. Users can only update their own data.',
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid data provided',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Can only update own data',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    format: 'uuid',
  })
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
    const syncAccount =
      await this.userService.resolveAccountNumber(accountNumber);
    const banks = await this.flutterwaveService.getBanks();

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
