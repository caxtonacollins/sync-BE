export class UpdateExchangeRateDto {
  fromCurrency?: string;
  toCurrency?: string;
  rate?: number;
  expiresAt?: Date;
}
