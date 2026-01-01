export interface WalletTransaction {
  id: string;
  type: 'fiat' | 'crypto';
  tokenSymbol: string;
  amount: number;
  status: string;
  reference: string;
  createdAt: Date;
  metadata?: any;
}

export interface WalletSummaryResponse {
  totalBalanceUSD: number;
  ethTokenBalance: number;
  strkTokenBalance: number;
  usdcTokenBalance: number;
  sngnTokenBalance: number;
  stakedSyncTokens: number;
  transactionFeeDiscount: number;
  activeLiquidityPools: number;
  dailySettlementCount: number;
}

export interface UnifiedWalletBalance {
  userId: string;
  cryptoBalances: {
    tokenSymbol: string;
    balance: string;
    walletId: string;
    network: string;
    address: string;
    isDefault: boolean;
  }[];
  totalValueUSD: string;
}

export interface WalletTransaction {
  id: string;
  type: 'fiat' | 'crypto';
  tokenSymbol: string;
  amount: number;
  status: string;
  reference: string;
  createdAt: Date;
  metadata?: any;
}
