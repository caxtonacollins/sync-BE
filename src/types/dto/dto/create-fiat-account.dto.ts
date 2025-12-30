import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateFiatAccountDto {
  @IsOptional()
  @IsString()
  @IsIn(['NGN', 'USD', 'GHS'], {
    message: 'tokenSymbol must be one of: NGN, USD, GHS',
  })
  tokenSymbol?: string = 'NGN';
}
