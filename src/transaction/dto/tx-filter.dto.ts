// dto/transaction-filter.dto.ts
import { IsOptional, IsNumber, IsString, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';

export class TxFilterDto {
  @IsOptional()
  @IsString()
  type?: string; // "deposit", "withdrawal" ....

  @IsOptional()
  @IsString()
  status?: string; // "pending", "completed" ....

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;


  @IsOptional()
  @IsISO8601()
  fromDate?: string;

  @IsOptional()
  @IsISO8601()
  toDate?: string;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 10);
  }
}
