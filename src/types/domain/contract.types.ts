export interface StarkNetAccountCreationResult {
  transactionHash: string;
  accountAddress: string;
  publicKey: string;
  privateKey: string;
  receipt?: any;
}

export interface ContractTokenBalance {
  symbol: string;
  balance: string;
  decimals: number;
  contractAddress: string;
}

export interface LiquidityBridgeResult {
  orderId: string;
  fromToken: string;
  toToken: string;
  amount: string;
  toAmount: string;
  exchangeRate: string;
  fee: string;
  status: 'pending' | 'completed' | 'failed';
  transactionHash?: string;
}
