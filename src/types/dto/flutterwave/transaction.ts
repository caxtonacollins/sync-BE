import { IsString, IsNumber, IsOptional } from 'class-validator';

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
