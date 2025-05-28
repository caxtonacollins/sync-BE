import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

export class ExchangeRateFilterDto {
  @IsOptional()
  @IsString()
  fromCurrency?: string;

  @IsOptional()
  @IsString()
  toCurrency?: string;

  @IsOptional()
  @IsNumber()
  minRate?: number;

  @IsOptional()
  @IsNumber()
  maxRate?: number;

  @IsOptional()
  @IsDateString()
  expiresBefore?: string;

  @IsOptional()
  @IsDateString()
  expiresAfter?: string;

  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  limit?: number = 10;
}
