import { IsNotEmpty, IsString, IsNumber } from "class-validator";

export class CreateExchangeRateDto {
    @IsNotEmpty()
    @IsString()
    fiatSymbol: string;
    @IsNotEmpty()
    @IsString()
    tokenSymbol: string;
    @IsNotEmpty()
    @IsNumber()
    rate: number;
}
