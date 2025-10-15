import { IsString, IsNumber, IsNotEmpty, IsEmail } from 'class-validator';

export class CreateFiatTransferDto {
  @IsEmail()
  @IsNotEmpty()
  recipientEmail: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;
}
