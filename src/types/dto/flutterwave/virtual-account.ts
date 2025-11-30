import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export interface VirtualAccountDetails {
  id: number;
  account_number: string;
  bank_name: string;
  bank_code: string;
  full_name: string;
  created_at: string;
  currency: string;
  is_permanent: boolean;
  status: string;
  reference: string;
  meta?: Record<string, any>;
}

export interface VirtualAccountResponse {
  status: string;
  message: string;
  data: VirtualAccountDetails;
}

export class CreateVirtualAccountDto {
  @IsString()
  email: string;

  @IsBoolean()
  is_permanent: boolean;

  @IsString()
  @IsOptional()
  bvn?: string;

  @IsString()
  tx_ref: string;

  @IsString()
  phonenumber: string;

  @IsString()
  firstname: string;

  @IsString()
  lastname: string;

  @IsString()
  narration: string;
}

export class UpdateVirtualAccountDto {
  @IsString()
  @IsOptional()
  bvn?: string;

  @IsBoolean()
  @IsOptional()
  is_permanent?: boolean;
}

export class DeleteVirtualAccountDto {
  @IsString()
  orderRef: string;
}
