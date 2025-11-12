import Decimal from 'decimal.js';

/**
 * Fintech Industry Standard Currency Utilities
 * 
 * This module provides standardized currency handling following fintech best practices:
 * - All amounts use Decimal.js for precision
 * - Standardized decimal places per currency
 * - Proper rounding strategies
 * - Currency-specific formatting
 */

/**
 * Standard decimal places for currencies
 * Following ISO 4217 standards and industry best practices
 */
export const CURRENCY_DECIMALS: Record<string, number> = {
  // Fiat Currencies (Standard: 2 decimal places)
  NGN: 2, // Nigerian Naira - Kobo
  USD: 2, // US Dollar - Cents
  GBP: 2, // British Pound - Pence
  EUR: 2, // Euro - Cents
  GHS: 2, // Ghanaian Cedi - Pesewas
  ZAR: 2, // South African Rand - Cents
  KES: 2, // Kenyan Shilling - Cents
  UGX: 0, // Ugandan Shilling (no decimal subdivision)
  JPY: 0, // Japanese Yen (no decimal subdivision)
  
  // Cryptocurrencies (Standard: 18 decimal places for most ERC-20 tokens)
  ETH: 18, // Ethereum
  STRK: 18, // Starknet
  USDC: 6, // USD Coin (6 decimals)
  USDT: 6, // Tether (6 decimals)
  DAI: 18, // Dai Stablecoin
  WBTC: 8, // Wrapped Bitcoin (8 decimals)
  BTC: 8, // Bitcoin (8 decimals)
  SYNC: 18, // Sync Token
};

/**
 * Get decimal places for a currency
 */
export function getCurrencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

/**
 * Check if currency is fiat
 */
export function isFiatCurrency(currency: string): boolean {
  const fiatCurrencies = ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'ZAR', 'KES', 'UGX', 'JPY'];
  return fiatCurrencies.includes(currency.toUpperCase());
}

/**
 * Check if currency is crypto
 */
export function isCryptoCurrency(currency: string): boolean {
  return !isFiatCurrency(currency);
}

/**
 * Convert amount to smallest unit (e.g., NGN to Kobo, ETH to Wei)
 */
export function toSmallestUnit(amount: string | number | Decimal, currency: string): bigint {
  const decimals = getCurrencyDecimals(currency);
  const amountDecimal = typeof amount === 'string' || typeof amount === 'number' 
    ? new Decimal(amount) 
    : amount;
  
  const multiplier = new Decimal(10).pow(decimals);
  const smallestUnit = amountDecimal.mul(multiplier);
  
  return BigInt(smallestUnit.floor().toString());
}

/**
 * Convert from smallest unit to major unit (e.g., Kobo to NGN, Wei to ETH)
 */
export function fromSmallestUnit(amount: bigint | string, currency: string): Decimal {
  const decimals = getCurrencyDecimals(currency);
  const amountBigInt = typeof amount === 'string' ? BigInt(amount) : amount;
  const amountDecimal = new Decimal(amountBigInt.toString());
  const divisor = new Decimal(10).pow(decimals);
  
  return amountDecimal.div(divisor);
}

/**
 * Format amount with proper decimal places and rounding
 * Uses ROUND_HALF_UP (banker's rounding) for financial accuracy
 */
export function formatAmount(
  amount: string | number | Decimal,
  currency: string,
  options?: {
    showSymbol?: boolean;
    useGrouping?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  const decimals = getCurrencyDecimals(currency);
  const amountDecimal = typeof amount === 'string' || typeof amount === 'number'
    ? new Decimal(amount)
    : amount;
  
  // Round to currency decimals using ROUND_HALF_UP
  const rounded = amountDecimal.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  
  const {
    showSymbol = false,
    useGrouping = true,
    minimumFractionDigits = decimals,
    maximumFractionDigits = decimals,
  } = options || {};
  
  // Format number
  let formatted = rounded.toFixed(maximumFractionDigits);
  
  // Add grouping (thousands separator)
  if (useGrouping) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formatted = parts.join('.');
  }
  
  // Add currency symbol
  if (showSymbol) {
    const symbols: Record<string, string> = {
      NGN: '₦',
      USD: '$',
      GBP: '£',
      EUR: '€',
      GHS: '₵',
      ZAR: 'R',
      ETH: 'Ξ',
      BTC: '₿',
    };
    
    const symbol = symbols[currency.toUpperCase()] || currency.toUpperCase();
    formatted = `${symbol}${formatted}`;
  }
  
  return formatted;
}

/**
 * Parse amount string to Decimal with validation
 */
export function parseAmount(amount: string | number, currency: string): Decimal {
  const amountStr = amount.toString().trim();
  
  if (!amountStr || isNaN(Number(amountStr))) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }
  
  const decimals = getCurrencyDecimals(currency);
  const parsed = new Decimal(amountStr);
  
  // Validate decimal places
  const decimalPlaces = parsed.decimalPlaces();
  if (decimalPlaces > decimals) {
    throw new Error(
      `Amount has ${decimalPlaces} decimal places, but ${currency} only supports ${decimals}`
    );
  }
  
  return parsed;
}

/**
 * Add two amounts with proper precision
 */
export function addAmounts(
  amount1: string | number | Decimal,
  amount2: string | number | Decimal,
  currency: string
): Decimal {
  const a1 = typeof amount1 === 'string' || typeof amount1 === 'number'
    ? new Decimal(amount1)
    : amount1;
  const a2 = typeof amount2 === 'string' || typeof amount2 === 'number'
    ? new Decimal(amount2)
    : amount2;
  
  const result = a1.plus(a2);
  const decimals = getCurrencyDecimals(currency);
  
  return result.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Subtract two amounts with proper precision
 */
export function subtractAmounts(
  amount1: string | number | Decimal,
  amount2: string | number | Decimal,
  currency: string
): Decimal {
  const a1 = typeof amount1 === 'string' || typeof amount1 === 'number'
    ? new Decimal(amount1)
    : amount1;
  const a2 = typeof amount2 === 'string' || typeof amount2 === 'number'
    ? new Decimal(amount2)
    : amount2;
  
  const result = a1.minus(a2);
  const decimals = getCurrencyDecimals(currency);
  
  return result.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Multiply amount with proper precision
 */
export function multiplyAmount(
  amount: string | number | Decimal,
  multiplier: string | number | Decimal,
  currency: string
): Decimal {
  const a = typeof amount === 'string' || typeof amount === 'number'
    ? new Decimal(amount)
    : amount;
  const m = typeof multiplier === 'string' || typeof multiplier === 'number'
    ? new Decimal(multiplier)
    : multiplier;
  
  const result = a.mul(m);
  const decimals = getCurrencyDecimals(currency);
  
  return result.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Divide amount with proper precision
 */
export function divideAmount(
  amount: string | number | Decimal,
  divisor: string | number | Decimal,
  currency: string
): Decimal {
  const a = typeof amount === 'string' || typeof amount === 'number'
    ? new Decimal(amount)
    : amount;
  const d = typeof divisor === 'string' || typeof divisor === 'number'
    ? new Decimal(divisor)
    : divisor;
  
  if (d.isZero()) {
    throw new Error('Division by zero');
  }
  
  const result = a.div(d);
  const decimals = getCurrencyDecimals(currency);
  
  return result.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Compare two amounts
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareAmounts(
  amount1: string | number | Decimal,
  amount2: string | number | Decimal
): number {
  const a1 = typeof amount1 === 'string' || typeof amount1 === 'number'
    ? new Decimal(amount1)
    : amount1;
  const a2 = typeof amount2 === 'string' || typeof amount2 === 'number'
    ? new Decimal(amount2)
    : amount2;
  
  if (a1.lessThan(a2)) return -1;
  if (a1.greaterThan(a2)) return 1;
  return 0;
}

/**
 * Get database precision for currency
 * Returns: { precision: number, scale: number }
 */
export function getDatabasePrecision(currency: string): { precision: number; scale: number } {
  if (isFiatCurrency(currency)) {
    return { precision: 20, scale: 2 }; // Decimal(20, 2) for fiat
  } else {
    return { precision: 30, scale: 18 }; // Decimal(30, 18) for crypto
  }
}

/**
 * Convert Decimal to string for API responses
 * Ensures consistent string representation
 */
export function toApiString(amount: Decimal | string | number, currency: string): string {
  const decimals = getCurrencyDecimals(currency);
  const amountDecimal = typeof amount === 'string' || typeof amount === 'number'
    ? new Decimal(amount)
    : amount;
  
  return amountDecimal.toFixed(decimals);
}

/**
 * Validate amount is positive
 */
export function validatePositiveAmount(amount: string | number | Decimal): boolean {
  const amountDecimal = typeof amount === 'string' || typeof amount === 'number'
    ? new Decimal(amount)
    : amount;
  
  return amountDecimal.greaterThan(0);
}

/**
 * Validate amount is non-negative
 */
export function validateNonNegativeAmount(amount: string | number | Decimal): boolean {
  const amountDecimal = typeof amount === 'string' || typeof amount === 'number'
    ? new Decimal(amount)
    : amount;
  
  return amountDecimal.greaterThanOrEqualTo(0);
}

