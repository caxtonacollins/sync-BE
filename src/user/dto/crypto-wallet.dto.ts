import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';

/**
 * DTO mirroring the Prisma `CryptoWallet` model.
 */
export class CryptoWalletDto {
  /** Owning user */
  @IsUUID()
  userId: string;

  /** Blockchain network (e.g. `starknet`, `ethereum`) */
  @IsString()
  network: string;

  /** Wallet address */
  @IsString()
  address: string;

  /** Currency symbol – BTC, ETH, USDC, etc. */
  @IsString()
  currency: string;

  /** Marks this as the user’s primary wallet for the currency */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  /** Active/inactive flag */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
