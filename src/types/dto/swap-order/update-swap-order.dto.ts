import {
  IsString,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';

export class LiquidityCheckDto {
  @IsString() available: string;
  @IsString() required: string;
}

export class UpdateSwapOrderDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsNumber()
  toAmount?: number;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsNumber()
  fee?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: Date;

  @IsOptional()
  @IsObject()
  metadata?: {
    provider?: string;
    liquidityCheck?: LiquidityCheckDto;
    minToAmount?: string;
    deadline?: number;
    error?: string;
  };

  @IsOptional()
  @IsString()
  transactionHash?: string;

  @IsOptional()
  @IsString()
  swapId?: string;
}
