import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';

/**
 * Data Transfer Object for creating a FiatAccount record.
 * Aligns with the Prisma `FiatAccount` model declared in `schema.prisma`.
 */
export class FiatAccountDto {
  /** The owning user – MUST be a valid UUID */
  @IsUUID()
  userId: string;

  /** Provider e.g. `monnify`, `paystack` */
  @IsString()
  provider: string;

  /** Provider–specific account number */
  @IsString()
  accountNumber: string;

  /** Human-readable account holder name */
  @IsString()
  accountName: string;

  /** Optional bank name (mainly for NGN accounts) */
  @IsOptional()
  @IsString()
  bankName?: string;

  /** Optional bank code (NUBAN, Sort-code, etc.) */
  @IsOptional()
  @IsString()
  bankCode?: string;

  /** Currency code – defaults to `NGN` in the DB layer */
  @IsOptional()
  @IsString()
  currency?: string;

  /** Marks the account as default for the user */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  /** Active/inactive flag */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
