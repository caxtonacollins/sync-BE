import { IsNotEmpty, IsString } from 'class-validator';

export class FlutterwaveWebhookDto {
  @IsNotEmpty()
  @IsString()
  event: string;

  @IsNotEmpty()
  data: {
    id: number;
    tx_ref: string;
    flw_ref: string;
    amount: number;
    currency: string;
    account_number: string;
    status: string;
    narration: string;
    payment_type: string;
    created_at: string;
  };

  @IsNotEmpty()
  @IsString()
  signature: string;
}
