export class CreateCryptoStakeDto {
  tokenSymbol: 'STRK' | 'ETH' | 'USDC' | 'USDT';
  amount: string; // In token units (e.g., "100.5")
  lockDays: number;
}

export class UnstakeCryptoDto {
  stakeId: string;
  tokenSymbol: string;
}

export class ClaimCryptoRewardsDto {
  stakeId: string;
  tokenSymbol: string;
}