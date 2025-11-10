import { IsOptional, IsString } from "class-validator";

export class CreateAccountDto {
  @IsOptional()
  fiatAccountId: string;

  @IsOptional()
  userContractAddress: string;
}

export class SetLiquidityContractAddressDto {
  address: string;
}

export class SetAccountClassHashDto {
  @IsString()
  classHash: string;
}

export class UpgradeAccountFactoryDto extends SetAccountClassHashDto { }

export class TransferOwnershipDto {
  newOwnerAddress: string;
}

export class SwapFiatToTokenDto {
  userContractAddress: string;
  fiatSymbol: string;
  tokenSymbol: string;
  fiatAmount: number;
  swapOrderId: string;
  tokenAmount: number;
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
  receiverAddress: string;
  amount: string;
  syncTokenAddress: string;
}