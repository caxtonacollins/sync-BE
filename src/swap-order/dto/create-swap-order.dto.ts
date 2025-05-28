import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
} from 'class-validator';

export class CreateSwapOrderDto {
  @IsString()
  fromCurrency: string;

  @IsString()
  toCurrency: string;

  @IsNumber()
  fromAmount: number;

  @IsNumber()
  toAmount: number;

  @IsNumber()
  rate: number;

  @IsNumber()
  @IsOptional()
  fee: number = 0;

  @IsOptional()
  @IsString()
  status: string;

  @IsUUID()
  userId: string;

  @IsString()
  reference: string;

  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}
