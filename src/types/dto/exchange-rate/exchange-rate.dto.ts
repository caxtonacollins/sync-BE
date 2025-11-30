import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateExchangeRateDto {
  @ApiProperty({
    description: 'Fiat currency symbol (e.g., USD, NGN, EUR)',
    example: 'NGN',
  })
  @IsString()
  @IsNotEmpty()
  fiatSymbol: string;

  @ApiProperty({
    description: 'Cryptocurrency symbol (e.g., BTC, ETH, USDT)',
    example: 'BTC',
  })
  @IsString()
  @IsNotEmpty()
  tokenSymbol: string;

  @ApiProperty({
    description: 'Exchange rate from fiat to crypto',
    example: 50000,
  })
  @IsNumber()
  @IsNotEmpty()
  rate: number;
}

export class UpdateExchangeRateDto {
  @ApiProperty({
    description: 'New exchange rate from fiat to crypto',
    example: 52000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  rate?: number;
}

export class ExchangeRateResponseDto {
  @ApiProperty({ description: 'Unique identifier of the exchange rate' })
  id: string;

  @ApiProperty({ description: 'Fiat currency symbol' })
  fiatSymbol: string;

  @ApiProperty({ description: 'Cryptocurrency symbol' })
  tokenSymbol: string;

  @ApiProperty({ description: 'Current exchange rate' })
  rate: number;

  @ApiProperty({ description: 'Timestamp when the rate was last updated' })
  updatedAt: Date;
}

export class ExchangeRateFilterDto {
  @ApiProperty({
    description: 'Filter by fiat currency symbol',
    required: false,
  })
  @IsOptional()
  @IsString()
  fiatSymbol?: string;

  @ApiProperty({
    description: 'Filter by cryptocurrency symbol',
    required: false,
  })
  @IsOptional()
  @IsString()
  tokenSymbol?: string;
}

// Export all DTOs as a single object for easier imports
export const ExchangeRateDtos = {
  CreateExchangeRateDto,
  UpdateExchangeRateDto,
  ExchangeRateResponseDto,
  ExchangeRateFilterDto,
};
