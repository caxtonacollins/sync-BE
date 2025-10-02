import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateCryptoWalletDto {
  @IsOptional()
  @IsString()
  @IsIn(['STRK', 'ETH', 'USDC', 'USDT'], {
    message: 'Currency must be one of: STRK, ETH, USDC, USDT',
  })
  currency?: string = 'STRK';
}
