import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateCryptoWalletDto {
  @IsOptional()
  @IsString()
  @IsIn(['STRK', 'ETH', 'USDC'], {
    message: 'tokenSymbol must be one of: STRK, ETH, USDC',
  })
  tokenSymbol?: string = 'STRK';
}
