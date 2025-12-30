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

  /** tokenSymbol symbol – BTC, ETH, USDC, etc. */
  @IsString()
  tokenSymbol: string;

  /** Encrypted private key */
  @IsString()
  encryptedPrivateKey: string;

  /** Marks this as the user’s primary wallet for the tokenSymbol */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  /** Active/inactive flag */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
