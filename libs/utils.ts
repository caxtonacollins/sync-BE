import crypto from 'crypto';

export const generateReference = () => {
    // Generate a unique ID using crypto.randomBytes and encode it in base64
    const uniqueID = crypto.randomBytes(16).toString('base64');

    // Replace non-alphanumeric characters with an empty string
    const cleanedId = uniqueID.replace(/[^a-zA-Z0-9]/g, '');

    // Add a custom preffix
    const reference = 'sync' + cleanedId;

    return reference;
};

export const parseTokenAmount = (amount: string, decimals: number): bigint => {
    const amountStr = amount.toString().trim();

    // Split into whole and fractional parts
    const [whole = '0', fraction = ''] = amountStr.split('.');

    // Pad or truncate fraction to match decimals
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);

    // Combine and convert to BigInt
    const combined = whole + paddedFraction;
    return BigInt(combined);
};