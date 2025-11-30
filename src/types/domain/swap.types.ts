export enum SwapType {
  TOKENTOFIAT = 'TOKENTOFIAT',
  FIATTOTOKEN = 'FIATTOTOKEN',
}

export interface SwapOrderFilter {
  fromCurrency?: string;
  toCurrency?: string;
  status?: string;
  userId?: string;
  minAmount?: number;
  maxAmount?: number;
  fromDate?: Date;
  toDate?: Date;
  page?: number;
  limit?: number;
}
