import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
} from 'class-validator';

export enum SwapType {
  TOKENTOFIAT = 'TOKENTOFIAT',
  FIATTOTOKEN = 'FIATTOTOKEN',
}

export class CreateSwapOrderDto {
  @IsString()
  fromCurrency: string;

  @IsString()
  toCurrency: string;

  @IsNumber()
  fromAmount: number;

  @IsNumber()
  @IsOptional()
  toAmount: number;

  @IsNumber()
  @IsOptional()
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

  @IsEnum(SwapType)
  swapType: SwapType;
}
