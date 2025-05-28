import {
  IsUUID,
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateTxDto {
  @IsUUID()
  userId: string;

  @IsString()
  type: string;

  @IsString()
  status: string;

  @IsNumber()
  amount: number;

  @IsString()
  currency: string;

  @IsNumber()
  @IsOptional()
  fee?: number = 0;

  @IsNumber()
  netAmount: number;

  @IsString()
  reference: string;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsUUID()
  fiatAccountId?: string;

  @IsOptional()
  @IsUUID()
  cryptoWalletId?: string;

  @IsOptional()
  @IsUUID()
  swapOrderId?: string;
}
