/**
 * Shared validation patterns used across the application
 */

// Nigerian phone number validation
export const NIGERIAN_PHONE_REGEX = /^(\+?234|0)[789]\d{9}$/;

// BVN validation - 11 digits starting with specific prefixes (22-39)
export const BVN_REGEX =
  /^(22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39)\d{9}$/;

// NIN validation - 11 digits starting with prefixes 1-9
export const NIN_REGEX = /^[1-9]\d{10}$/;

// Password validation
export const PASSWORD_VALIDATORS = {
  MIN_LENGTH: 8,
  UPPERCASE: /[A-Z]/,
  LOWERCASE: /[a-z]/,
  NUMBER: /[0-9]/,
  SPECIAL: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
};

// Name validation
export const NAME_REGEX = /^[a-zA-Z\s]+$/;
