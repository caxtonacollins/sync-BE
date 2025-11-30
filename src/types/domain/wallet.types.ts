export interface WalletSummaryResponse {
  totalBalanceNGN: number;
  totalBalanceUSD: number;
  syncTokenBalance: number;
  ethTokenBalance: number;
  strkTokenBalance: number;
  usdcTokenBalance: number;
  stakedSyncTokens: number;
  transactionFeeDiscount: number;
  activeLiquidityPools: number;
  dailySettlementCount: number;
}

export interface UnifiedWalletBalance {
  userId: string;
  fiatBalances: {
    currency: string;
    balance: string;
    accountId: string;
    provider: string;
    isDefault: boolean;
  }[];
  cryptoBalances: {
    currency: string;
    balance: string;
    address: string;
    network: string;
  }[];
}

export interface WalletTransaction {
  id: string;
  type: 'fiat' | 'crypto';
  currency: string;
  amount: number;
  status: string;
  reference: string;
  createdAt: Date;
  metadata?: any;
}
