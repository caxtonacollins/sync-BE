import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsIn,
  IsNotEmpty,
  IsPositive,
  IsUUID,
  IsOptional,
  Min,
  IsDateString,
} from 'class-validator';

export type StakingToken = 'STRK' | 'ETH' | 'USDC' | 'USDT';

export class CreateCryptoStakeDto {
  @ApiProperty({
    description: 'Symbol of the token to stake',
    enum: ['STRK', 'ETH', 'USDC', 'USDT'],
    example: 'ETH',
    required: true,
  })
  @IsIn(['STRK', 'ETH', 'USDC', 'USDT'])
  tokenSymbol: StakingToken;

  @ApiProperty({
    description: 'Amount to stake in token units (e.g., "1.5")',
    example: '1.5',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({
    description: 'Number of days to lock the stake (minimum 7 days)', 
    example: 30,
    required: true,
    minimum: 7,
  })
  @IsNumber()
  @Min(7)
  @IsPositive()
  lockDays: number;
}

export class UnstakeCryptoDto {
  @ApiProperty({
    description: 'Unique identifier of the stake position',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true,
  })
  @IsUUID()
  @IsNotEmpty()
  stakeId: string;

  @ApiProperty({
    description: 'Symbol of the staked token',
    enum: ['STRK', 'ETH', 'USDC', 'USDT'],
    example: 'ETH',
    required: true,
  })
  @IsIn(['STRK', 'ETH', 'USDC', 'USDT'])
  tokenSymbol: StakingToken;
}

export class ClaimCryptoRewardsDto {
  @ApiProperty({
    description: 'Unique identifier of the stake position',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: true,
  })
  @IsUUID()
  @IsNotEmpty()
  stakeId: string;

  @ApiProperty({
    description: 'Symbol of the staked token',
    enum: ['STRK', 'ETH', 'USDC', 'USDT'],
    example: 'ETH',
    required: true,
  })
  @IsIn(['STRK', 'ETH', 'USDC', 'USDT'])
  tokenSymbol: StakingToken;
}

export class StakingPositionResponseDto {
  @ApiProperty({ description: 'Unique identifier of the stake position' })
  id: string;

  @ApiProperty({ description: 'User ID who owns the stake' })
  userId: string;

  @ApiProperty({ description: 'Token symbol' })
  tokenSymbol: StakingToken;

  @ApiProperty({ description: 'Amount staked in token units' })
  amount: string;

  @ApiProperty({ description: 'Current value of rewards in token units' })
  rewards: string;

  @ApiProperty({ description: 'APY for this staking position' })
  apy: number;

  @ApiProperty({ description: 'Number of days the stake is locked for' })
  lockDays: number;

  @ApiProperty({ description: 'Date when the stake was created' })
  createdAt: Date;

  @ApiProperty({ description: 'Date when the stake can be unstaked' })
  unlockDate: Date;
}

export class StakingStatsResponseDto {
  @ApiProperty({ description: 'Total value locked across all staking positions' })
  totalValueLocked: string;

  @ApiProperty({ description: 'Average APY across all staking pools' })
  averageApy: number;

  @ApiProperty({ description: 'Total number of active stakers' })
  totalStakers: number;
}

export class StakingHistoryFilterDto {
  @ApiProperty({
    description: 'Filter by token symbol',
    enum: ['STRK', 'ETH', 'USDC', 'USDT'],
    required: false,
  })
  @IsOptional()
  @IsIn(['STRK', 'ETH', 'USDC', 'USDT'])
  tokenSymbol?: StakingToken;

  @ApiProperty({
    description: 'Filter by date from (ISO date string)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiProperty({
    description: 'Filter by date to (ISO date string)',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}