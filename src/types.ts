export interface TokenBalance {
  raw: string;
  formatted: string;
  symbol: string;
  decimals: number;
}

export interface RegistrationStatus {
  isRegistered: boolean;
  accountAddress: string;
}

export interface VirtualAccountUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  bvn?: string | null;
  nin?: string | null;
}

export interface MultipleBalancesResponse {
  [key: string]: TokenBalance;
}

export type BaseStake = {
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
};

export type CryptoStake = BaseStake & {
  type: 'CRYPTO';
  tokenSymbol: string;
};

export type FiatStake = BaseStake & {
  type: 'FIAT';
  currency: string;
};

export type Stake = CryptoStake | FiatStake;
