import Decimal from 'decimal.js';

/**
 * Fintech Industry Standard tokenSymbol Utilities
 *
 * This module provides standardized tokenSymbol handling following fintech best practices:
 * - All amounts use Decimal.js for precision
 * - Standardized decimal places per tokenSymbol
 * - Proper rounding strategies
 * - tokenSymbol-specific formatting
 */

/**
 * Standard decimal places for currencies
 * Following ISO 4217 standards and industry best practices
 */
export const tokenSymbol_DECIMALS: Record<string, number> = {
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
  sNGN: 18, // Sync Naira (18 decimals)
};

/**
 * Get decimal places for a tokenSymbol
 */
export function getTokenSymbolDecimals(tokenSymbol: string): number {
  return tokenSymbol_DECIMALS[tokenSymbol] ?? 2;
}

/**
 * Check if tokenSymbol is fiat
 */
export function isFiattokenSymbol(tokenSymbol: string): boolean {
  const fiatCurrencies = [
    'NGN',
    'USD',
    'GBP',
    'EUR',
    'GHS',
    'ZAR',
    'KES',
    'UGX',
    'JPY',
  ];
  return fiatCurrencies.includes(tokenSymbol);
}

/**
 * Check if tokenSymbol is crypto
 */
export function isCrypto(tokenSymbol: string): boolean {
  return !isFiattokenSymbol(tokenSymbol);
}

/**
 * Convert amount to smallest unit (e.g., NGN to Kobo, ETH to Wei)
 */
export function toSmallestUnit(
  amount: string | number | Decimal,
  tokenSymbol: string,
): bigint {
  const decimals = getTokenSymbolDecimals(tokenSymbol);
  // Convert to string first to handle scientific notation properly
  const amountStr = amount.toString();
  
  // Use Decimal.js for precise arithmetic with large numbers
  const amountDecimal = new Decimal(amountStr);
  const multiplier = new Decimal(10).pow(decimals);
  
  try {
    const smallestUnit = amountDecimal.times(multiplier);
    // Convert to string first to avoid scientific notation, then to BigInt
    return BigInt(smallestUnit.toFixed(0, Decimal.ROUND_DOWN));
  } catch (error) {
    console.error('Error converting to smallest unit:', {
      amount,
      amountStr,
      amountDecimal: amountDecimal.toString(),
      multiplier: multiplier.toString(),
      error: error.message,
    });
    throw new Error(`Failed to convert amount to smallest unit: ${error.message}`);
  }
}

/**
 * Convert from smallest unit to major unit (e.g., Kobo to NGN, Wei to ETH)
 */
export function fromSmallestUnit(
  amount: bigint | string,
  tokenSymbol: string,
): Decimal {
  const decimals = getTokenSymbolDecimals(tokenSymbol);
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
  tokenSymbol: string,
  options?: {
    showSymbol?: boolean;
    useGrouping?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  },
): string {
  const decimals = getTokenSymbolDecimals(tokenSymbol);
  const amountDecimal =
    typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;

  // Round to tokenSymbol decimals using ROUND_HALF_UP
  const rounded = amountDecimal.toDecimalPlaces(
    decimals,
    Decimal.ROUND_HALF_UP,
  );

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

  // Add tokenSymbol symbol
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

    const symbol = symbols[tokenSymbol] || tokenSymbol;
    formatted = `${symbol}${formatted}`;
  }

  return formatted;
}

/**
 * Parse amount string to Decimal with validation
 */
export function parseAmount(
  amount: string | number,
  tokenSymbol: string,
): Decimal {
  const amountStr = amount.toString().trim();

  if (!amountStr || isNaN(Number(amountStr))) {
    throw new Error(`Invalid amount: ${amountStr}`);
  }

  const decimals = getTokenSymbolDecimals(tokenSymbol);
  const parsed = new Decimal(amountStr);

  // Special handling for sNGN which should support 18 decimal places
  if (tokenSymbol === 'sNGN' && parsed.decimalPlaces() > 18) {
    throw new Error(
      `Amount has ${parsed.decimalPlaces()} decimal places, but sNGN only supports 18`,
    );
  }
  
  // Validate decimal places for other tokens
  if (tokenSymbol !== 'sNGN' && parsed.decimalPlaces() > decimals) {
    throw new Error(
      `Amount has ${parsed.decimalPlaces()} decimal places, but ${tokenSymbol} only supports ${decimals}`,
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
  tokenSymbol: string,
): Decimal {
  const a1 =
    typeof amount1 === 'string' || typeof amount1 === 'number'
      ? new Decimal(amount1)
      : amount1;
  const a2 =
    typeof amount2 === 'string' || typeof amount2 === 'number'
      ? new Decimal(amount2)
      : amount2;

  const result = a1.plus(a2);
  const decimals = getTokenSymbolDecimals(tokenSymbol);

  return result.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Subtract two amounts with proper precision
 */
export function subtractAmounts(
  amount1: string | number | Decimal,
  amount2: string | number | Decimal,
  tokenSymbol: string,
): Decimal {
  const a1 =
    typeof amount1 === 'string' || typeof amount1 === 'number'
      ? new Decimal(amount1)
      : amount1;
  const a2 =
    typeof amount2 === 'string' || typeof amount2 === 'number'
      ? new Decimal(amount2)
      : amount2;

  const result = a1.minus(a2);
  const decimals = getTokenSymbolDecimals(tokenSymbol);

  return result.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Multiply amount with proper precision
 */
export function multiplyAmount(
  amount: string | number | Decimal,
  multiplier: string | number | Decimal,
  tokenSymbol: string,
): Decimal {
  const a =
    typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;
  const m =
    typeof multiplier === 'string' || typeof multiplier === 'number'
      ? new Decimal(multiplier)
      : multiplier;

  const result = a.mul(m);
  const decimals = getTokenSymbolDecimals(tokenSymbol);

  return result.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Divide amount with proper precision
 */
export function divideAmount(
  amount: string | number | Decimal,
  divisor: string | number | Decimal,
  tokenSymbol: string,
): Decimal {
  const a =
    typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;
  const d =
    typeof divisor === 'string' || typeof divisor === 'number'
      ? new Decimal(divisor)
      : divisor;

  if (d.isZero()) {
    throw new Error('Division by zero');
  }

  const result = a.div(d);
  const decimals = getTokenSymbolDecimals(tokenSymbol);

  return result.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Compare two amounts
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareAmounts(
  amount1: string | number | Decimal,
  amount2: string | number | Decimal,
): number {
  const a1 =
    typeof amount1 === 'string' || typeof amount1 === 'number'
      ? new Decimal(amount1)
      : amount1;
  const a2 =
    typeof amount2 === 'string' || typeof amount2 === 'number'
      ? new Decimal(amount2)
      : amount2;

  if (a1.lessThan(a2)) return -1;
  if (a1.greaterThan(a2)) return 1;
  return 0;
}

/**
 * Get database precision for tokenSymbol
 * Returns: { precision: number, scale: number }
 */
export function getDatabasePrecision(tokenSymbol: string): {
  precision: number;
  scale: number;
} {
  if (isFiattokenSymbol(tokenSymbol)) {
    return { precision: 20, scale: 2 }; // Decimal(20, 2) for fiat
  } else {
    return { precision: 30, scale: 18 }; // Decimal(30, 18) for crypto
  }
}

/**
 * Convert Decimal to string for API responses
 * Ensures consistent string representation
 */
export function toApiString(
  amount: Decimal | string | number,
  tokenSymbol: string,
): string {
  const decimals = getTokenSymbolDecimals(tokenSymbol);
  const amountDecimal =
    typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;

  return amountDecimal.toFixed(decimals);
}

/**
 * Validate amount is positive
 */
export function validatePositiveAmount(
  amount: string | number | Decimal,
): boolean {
  const amountDecimal =
    typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;

  return amountDecimal.greaterThan(0);
}

/**
 * Validate amount is non-negative
 */
export function validateNonNegativeAmount(
  amount: string | number | Decimal,
): boolean {
  const amountDecimal =
    typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;

  return amountDecimal.greaterThanOrEqualTo(0);
}
