import { IsNotEmpty, IsString } from 'class-validator';

export class Enable2FADto {
  @IsString()
  @IsNotEmpty()
  otpCode: string;
}

export class Verify2FADto {
  @IsString()
  @IsNotEmpty()
  otpCode: string;
}
