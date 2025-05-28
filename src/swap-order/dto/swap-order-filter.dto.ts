import { IsOptional, IsString, IsNumber, IsUUID } from 'class-validator';

export class SwapOrderFilterDto {
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  limit?: number = 10;

  @IsOptional()
  @IsString()
  fromCurrency?: string;

  @IsOptional()
  @IsString()
  toCurrency?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsNumber()
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  maxAmount?: number;
}
