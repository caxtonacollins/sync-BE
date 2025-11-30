import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateFiatAccountDto {
  @IsOptional()
  @IsString()
  @IsIn(['NGN', 'USD', 'GHS'], {
    message: 'Currency must be one of: NGN, USD, GHS',
  })
  currency?: string = 'NGN';
}
