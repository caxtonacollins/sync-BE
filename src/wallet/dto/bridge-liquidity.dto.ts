import { IsString, IsNumber, IsIn, IsPositive, Min } from 'class-validator';

export class BridgeLiquidityDto {
  @IsString()
  @IsIn(['fiat', 'crypto'], {
    message: 'fromType must be either "fiat" or "crypto"',
  })
  fromType: 'fiat' | 'crypto';

  @IsString()
  @IsIn(['fiat', 'crypto'], {
    message: 'toType must be either "fiat" or "crypto"',
  })
  toType: 'fiat' | 'crypto';

  @IsString()
  @IsIn(['NGN', 'USD', 'STRK', 'ETH', 'USDC'], {
    message: 'fromCurrency must be one of: NGN, USD, STRK, ETH, USDC',
  })
  fromCurrency: string;

  @IsString()
  @IsIn(['NGN', 'USD', 'STRK', 'ETH', 'USDC'], {
    message: 'toCurrency must be one of: NGN, USD, STRK, ETH, USDC',
  })
  toCurrency: string;

  @IsNumber()
  @IsPositive({
    message: 'Amount must be a positive number',
  })
  @Min(0.01, {
    message: 'Minimum bridge amount is 0.01',
  })
  amount: number;
}
