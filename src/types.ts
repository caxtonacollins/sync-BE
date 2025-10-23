export interface TokenBalance {
    raw: string;
    formatted: string;
    symbol: string;
    decimals: number;
}

export interface RegistrationStatus {
    isRegistered: boolean;
    accountAddress: string;
}

export interface MultipleBalancesResponse {
    [key: string]: TokenBalance;
}