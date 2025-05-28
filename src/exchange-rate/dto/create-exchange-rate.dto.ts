export class CreateExchangeRateDto {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  expiresAt: Date;
}
