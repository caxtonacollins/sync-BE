import { IsString, IsNumber, IsOptional, IsObject, IsBoolean, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class FlutterwaveCustomerDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phone_number: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  created_at: string;
}

class FlutterwavePaymentDataDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  tx_ref: string;

  @ApiProperty()
  flw_ref: string;

  @ApiProperty()
  device_fingerprint: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  charged_amount: number;

  @ApiProperty()
  app_fee: number;

  @ApiProperty()
  merchant_fee: number;

  @ApiProperty()
  processor_response: string;

  @ApiProperty()
  auth_model: string;

  @ApiProperty()
  ip: string;

  @ApiProperty()
  narration: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  account_number: string;

  @ApiProperty()
  payment_type: string;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  account_id: number;

  @ApiProperty()
  customer: FlutterwaveCustomerDto;

  @ApiProperty({ required: false })
  card?: {
    first_6digits: string;
    last_4digits: string;
    issuer: string;
    country: string;
    type: string;
    token: string;
    expiry: string;
  };
}

export class FlutterwaveWebhookDto {
  @ApiProperty()
  @IsString()
  event: string;

  @ApiProperty()
  @IsString()
  @IsIn(['successful', 'failed', 'pending'])
  status: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tx_ref: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  flw_ref?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  transfer_id?: string;

  @ApiProperty({ type: FlutterwavePaymentDataDto })
  @IsObject()
  data: FlutterwavePaymentDataDto;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  processor_response?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  created_at?: string;
}

export class FlutterwaveTransferWebhookDto {
  @ApiProperty()
  @IsString()
  event: 'transfer.completed' | 'transfer.failed' | 'transfer.reversed';

  @ApiProperty()
  @IsObject()
  data: {
    id: number;
    account_number: string;
    bank_code: string;
    fullname: string;
    date_created: string;
    currency: string;
    debit_currency: string;
    amount: number;
    fee: number;
    status: string;
    reference: string;
    meta: Record<string, any> | null;
    narration: string;
    approver: string | null;
    complete_message: string;
    requires_approval: number;
    is_approved: number;
    bank_name: string;
  };
}

export class FlutterwaveWebhookResponseDto {
  @ApiProperty()
  @IsString()
  status: 'success' | 'error';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  message?: string;
}
