import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAccountDto {
  @IsOptional()
  userId: string;

  @IsOptional()
  userContractAddress: string;
}

export class SetLiquidityContractAddressDto {
  @IsString()
  address: string;
}

export class SetAccountClassHashDto {
  @IsString()
  classHash: string;
}

export class UpgradeAccountFactoryDto extends SetAccountClassHashDto {}

export class TransferOwnershipDto {
  @IsString()
  newOwnerAddress: string;
}

export class SwapFiatToTokenDto {
  @IsString()
  userContractAddress: string;

  @IsString()
  fiatSymbol: string;

  @IsString()
  tokenSymbol: string;

  @IsNumber()
  fiatAmount: number;

  @IsString()
  swapOrderId: string;

  @IsNumber()
  tokenAmount: number;

  @IsNumber()
  fee: number;
}

export class SwapTokenToFiatDto {
  userContractAddress: string;
  fiatSymbol: string;
  tokenSymbol: string;
  tokenAmount: string;
  swapOrderId: string;
}

export class MintTokenDto {
  @IsString()
  receiverAddress: string;

  @IsString()
  amount: string;

  @IsString()
  syncTokenAddress: string;
}
