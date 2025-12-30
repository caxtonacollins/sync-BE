export class CreateFiatStakeDto {
    tokenSymbol: 'NGN' | 'USD' | 'GBP' | 'GHS' | 'ZAR';
    amount: number; // In major units (e.g., 1000 NGN, not kobo)
    lockDays: number;
}

export class ClaimFiatRewardsDto {
    stakeId: string;
    tokenSymbol: string;
}

export class UnstakeFiatDto {
    stakeId: string;
    tokenSymbol: string;
}
