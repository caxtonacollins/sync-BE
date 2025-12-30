import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Param,
  Delete,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { FlutterwaveService } from './flutterwave.service';
import { User } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { VerifyPaymentDto, InitializePaymentDto } from 'src/types/dto/flutterwave/transaction';
import { ApiResponseType, UpdateBVNDto, InitializePaymentResponse } from 'src/types/dto/flutterwave/response';

@ApiTags('Flutterwave')
@Controller('flutterwave')
@UseGuards(AuthGuard('jwt'))
export class FlutterwaveController {
  constructor(private readonly flutterwaveService: FlutterwaveService) {}

  @Post('create-virtual-accounts')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Create virtual accounts for a user' })
  @ApiResponse({ status: 201, description: 'Virtual accounts created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid user data' })
  async createVirtualAccounts(@Req() req: Request) {
    const userId = req.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    const user = await this.flutterwaveService.getUserById(userId);
    return this.flutterwaveService.createVirtualAccounts(user);
  }

  @Post('initialize-payment')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize Flutterwave payment' })
  @ApiResponse({ 
    status: 200, 
    description: 'Payment initialized successfully', 
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        status: { type: 'string' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            publicKey: { type: 'string' },
            txRef: { type: 'string' },
            amount: { type: 'number' },
            tokenSymbol: { type: 'string' },
            customer: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string' }
              }
            },
            customizations: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                logo: { type: 'string' }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
  @ApiBody({ type: InitializePaymentDto })
  async initializePayment(
    @Body() initializePaymentDto: InitializePaymentDto,
    @Req() req: Request
  ): Promise<InitializePaymentResponse> {
    try {
      const userId = req.user?.['userId'];
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const user = await this.flutterwaveService.getUserById(userId);
      
      // Generate a unique transaction reference
      const txRef = `FLW-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // In a real implementation, you would save this transaction reference to your database
      // and associate it with the user
      
      // Return the Flutterwave public key and transaction reference to the frontend
      const response: InitializePaymentResponse = {
        success: true,
        status: 'success',
        message: 'Payment initialized successfully',
        data: {
          publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
          txRef,
          amount: initializePaymentDto.amount,
          tokenSymbol: initializePaymentDto.tokenSymbol || 'NGN',
          customer: {
            email: user.email,
            name: `${user.firstName} ${user.lastName}`,
            phone: user.phoneNumber || '',
          },
          customizations: {
            title: 'Sync Payment',
            description: `Fund your Sync wallet with ${initializePaymentDto.tokenSymbol || 'NGN'} ${initializePaymentDto.amount}`,
            logo: 'https://your-logo-url.com/logo.png',
          },
        },
      };
      
      return response;
    } catch (error) {
      const errorResponse: InitializePaymentResponse = {
        success: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to initialize payment',
        data: undefined,
      };
      
      return errorResponse;
    }
  }

  @Post('verify')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify a Flutterwave payment' })
  @ApiResponse({ status: 200, description: 'Payment verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
  async verifyPayment(
    @Body() verifyPaymentDto: VerifyPaymentDto,
    @Req() req: Request
  ): Promise<ApiResponseType> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const result = await this.flutterwaveService.verifyPayment(
        verifyPaymentDto.transaction_id,
        userId,
        verifyPaymentDto.amount || 0,
        verifyPaymentDto.tokenSymbol || 'NGN'
      );

      return {
        success: true,
        status: 'success',
        message: 'Payment verified successfully',
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        status: 'error',
        message: error.message || 'Failed to verify payment',
        data: null
      };
    }
  }

  @Get('get-virtual-account')
  async getVirtualAccount(@Query('ref') ref: string) {
    return this.flutterwaveService.getVirtualAccount(ref);
  }

  @Get('get-exchange-rate')
  async getExchangeRate(
    @Query('sourcetokenSymbol') sourcetokenSymbol: string,
    @Query('destinationtokenSymbol') destinationtokenSymbol: string,
    @Query('amount') amount: number,
  ) {
    return this.flutterwaveService.getExchangeRate(
      sourcetokenSymbol,
      destinationtokenSymbol,
      amount,
    );
  }

  @Put('virtual-account/:orderRef/bvn')
  async updateBVN(
    @Param('orderRef') orderRef: string,
    @Body() updateBVNDto: UpdateBVNDto,
  ) {
    return this.flutterwaveService.updateBVN(orderRef, updateBVNDto.bvn);
  }

  @Delete('virtual-account/:orderRef')
  async deleteVirtualAccount(@Param('orderRef') orderRef: string) {
    return this.flutterwaveService.deleteVirtualAccount(orderRef);
  }
}
