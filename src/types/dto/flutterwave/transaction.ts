import { IsString, IsNumber, IsOptional, IsEmail, IsPhoneNumber, Min, IsIn } from 'class-validator';

export class InitializePaymentDto {
  @IsNumber()
  @Min(100, { message: 'Amount must be at least 100' })
  amount: number;

  @IsString()
  @IsOptional()
  @IsIn(['NGN', 'USD', 'EUR', 'GBP'], { message: 'Currency must be one of: NGN, USD, EUR, GBP' })
  currency?: string = 'NGN';

  @IsString()
  @IsOptional()
  paymentMethod?: string = 'card';
}

export interface TransactionResponse {
  status: string;
  message: string;
  data: any;
}

export class VerifyPaymentDto {
  @IsString()
  transaction_id: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'NGN';
}

export interface ExchangeRateResponse {
  status: string;
  message: string;
  data: {
    rate: number;
    source: {
      currency: string;
      amount: number;
    };
    destination: {
      currency: string;
      amount: number;
    };
  };
}
