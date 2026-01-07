import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
  IsObject,
} from 'class-validator';

export enum SwapType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP_LIMIT = 'STOP_LIMIT',
  OCO = 'OCO',
}

export class SwapOrderDto {
  @IsString()
  @IsOptional()
  id?: string;

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
  toAmount: number;

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

  @IsOptional()
  @IsObject()
  metadata?: {
    swapId: string;
    minToAmount: string;
    deadline: number;
    transactionHash: string;
    completedAt: string;
    error: string;
  };
}
