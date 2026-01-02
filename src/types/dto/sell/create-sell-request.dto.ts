import { IsNumber, IsString, IsOptional, IsObject } from 'class-validator';

export class CreateSellRequestDto {
  @IsNumber()
  amount: number;

  @IsString()
  currency: string;

  @IsObject()
  bankAccount: {
    accountName?: string;
    accountNumber: string;
    bankName?: string;
    bankCode?: string;
    accountReference?: string;
  };

  @IsOptional()
  @IsString()
  metadata?: string;
}
