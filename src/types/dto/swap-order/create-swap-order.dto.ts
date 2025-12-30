import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
} from 'class-validator';

export enum SwapType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_LIMIT = 'STOP_LIMIT',
  OCO = 'OCO',
}

export class CreateSwapOrderDto {
  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsNumber()
  amount: number;

  @IsNumber()
  @IsOptional()
  rate: number;

  @IsNumber()
  @IsOptional()
  toAmount?: number;

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

  @IsEnum(SwapType)
  swapType: SwapType;
}
