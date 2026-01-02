import { IsNotEmpty, IsNumber, IsString, IsOptional, IsObject } from "class-validator";

// src/types/dto/buy/buy-request.dto.ts
export class CreateBuyRequestDto {
    @IsNotEmpty()
    @IsNumber()
    amountNGN: number;

    @IsNotEmpty()
    @IsString()
    paymentMethod: 'card' | 'bank_transfer';

    @IsOptional()
    @IsString()
    bankCode?: string;
}

// src/types/dto/buy/buy-response.dto.ts
export class BuyInitiationResponse {
    @IsString()
    publicKey: string;

    @IsString()
    txRef: string;

    @IsNumber()
    amount: number;

    @IsString()
    currency: string;

    @IsObject()
    customer: {
        email: string;
        name: string;
    };

    @IsObject()
    customizations: {
        title: string;
        description: string;
        logo: string;
    };
}