import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  encryptionKey?: string;
}

export class ImportWalletDto {
  @IsString()
  @IsNotEmpty()
  privateKey: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}
