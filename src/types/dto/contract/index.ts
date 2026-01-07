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

export class CreateSwapDto {
  @IsString()
  fromToken: string;

  @IsString()
  toToken: string;

  @IsString()
  fromAmount: string;

  @IsString()
  minToAmount: string;

  @IsNumber()
  deadline: number; // Unix timestamp in seconds
}

export class ExecuteSwapDto {
  @IsNumber()
  swapId: number;
}

export class MintTokenDto {
  @IsString()
  receiverAddress: string;

  @IsString()
  amount: string;

  @IsString()
  syncTokenAddress: string;
}
