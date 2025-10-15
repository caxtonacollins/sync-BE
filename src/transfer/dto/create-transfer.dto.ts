import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  @IsNotEmpty()
  toAddress: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  token: string;

  userId: string;
}
