import Decimal from 'decimal.js';
import { toApiString, getCurrencyDecimals } from './currency.utils';

/**
 * Utility functions for formatting API responses
 * Ensures all financial amounts are returned as strings for precision
 */

/**
 * Format Decimal amount to string for API response
 */
export function formatAmountForApi(
  amount: Decimal | string | number | null | undefined,
  currency: string,
): string {
  if (amount === null || amount === undefined) {
    return '0';
  }
  return toApiString(amount, currency);
}

/**
 * Format balance response with proper string conversion
 */
export function formatBalanceResponse(balance: {
  balance?: Decimal | string | number | null;
  availableBalance?: Decimal | string | number | null;
  currency: string;
}): {
  balance: string;
  availableBalance: string;
  currency: string;
} {
  return {
    balance: formatAmountForApi(balance.balance ?? 0, balance.currency),
    availableBalance: formatAmountForApi(
      balance.availableBalance ?? balance.balance ?? 0,
      balance.currency,
    ),
    currency: balance.currency,
  };
}

/**
 * Format unified wallet balance response
 */
export function formatUnifiedWalletBalance(balance: {
  currency: string;
  balance: Decimal | string | number;
  [key: string]: any;
}): {
  currency: string;
  balance: string;
  [key: string]: any;
} {
  return {
    ...balance,
    balance: formatAmountForApi(balance.balance, balance.currency),
  };
}

