export interface TokenBalance {
  raw: string;
  formatted: string;
  symbol: string;
  decimals: number;
}

export interface MultipleBalancesResponse {
  [key: string]: TokenBalance;
}
