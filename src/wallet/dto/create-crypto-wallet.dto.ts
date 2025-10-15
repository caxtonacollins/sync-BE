import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateCryptoWalletDto {
  @IsOptional()
  @IsString()
  @IsIn(['STRK', 'ETH', 'USDC'], {
    message: 'Currency must be one of: STRK, ETH, USDC',
  })
  currency?: string = 'STRK';
}
