export interface BaseStake {
  id: string;
  amount: number | string;
  stakedAt: Date;
  unlockAt: Date;
  lockDays: number;
  apyBps: number;
  apy: string;
  pendingRewards: number;
  isLocked: boolean;
  daysRemaining: number;
  onChainVerified: boolean;
  onChainTxHash: string | null;
}

export interface CryptoStake extends BaseStake {
  type: 'CRYPTO';
  tokenSymbol: string;
}

export interface FiatStake extends BaseStake {
  type: 'FIAT';
  tokenSymbol: string;
}

export type Stake = CryptoStake | FiatStake;
