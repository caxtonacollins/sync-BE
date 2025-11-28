import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsIn,
  IsNotEmpty,
  IsPositive,
} from 'class-validator';

export class CreateCryptoStakeDto {
  @ApiProperty({
    description: 'Symbol of the token to stake',
    enum: ['STRK', 'ETH', 'USDC', 'USDT'],
    required: true,
  })
  @IsIn(['STRK', 'ETH', 'USDC', 'USDT'])
  tokenSymbol: 'STRK' | 'ETH' | 'USDC' | 'USDT';

  @ApiProperty({
    description: 'Amount to stake in token units (e.g., "100.5")',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({
    description: 'Number of days to lock the stake',
    required: true,
  })
  @IsNumber()
  @IsPositive()
  lockDays: number;
}

export class UnstakeCryptoDto {
  stakeId: string;
  tokenSymbol: string;
}

export class ClaimCryptoRewardsDto {
  stakeId: string;
  tokenSymbol: string;
}
