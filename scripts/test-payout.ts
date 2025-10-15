import { PaymentService } from '../src/payment/payment.service';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { FlutterwaveService } from '../src/flutterwave/flutterwave.service';

dotenv.config();

async function testPayout() {
    // Initialize services
    const prisma = new PrismaClient();
    const flutterwaveService = new FlutterwaveService();
    const paymentService = new PaymentService(flutterwaveService);

    try {
        const fiatAccount = {
            "id": "9645884c-0c0f-42b3-bad9-9d4b08f70bcb",
            "userId": "2b4b6efc-9ec4-40a0-914a-f49cd4e6090d",
            "provider": "flutterwave",
            "accountNumber": "0690000040",
            "accountName": "New 1",
            "bankName": "Mock Bank",
            "bankCode": "044",
            "balance": 0,
            "availableBalance": 0,
            "ledgerBalance": 0,
            "currency": "NGN",
            "isDefault": true,
            "isActive": true,
            "createdAt": "2025-10-11T11:55:19.932Z",
            "updatedAt": "2025-10-11T11:55:19.932Z",
            "verifiedAt": null,
            "contractCode": null,
            "accountReference": "URF_1760183718951_5867135",
            "reservationReference": null,
            "reservedAccountType": null,
            "collectionChannel": null,
            "customerEmail": null,
            "customerName": null,
            "accounts": {
                "note": "Mock note",
                "amount": "0.00",
                "flw_ref": "MockFLWRef-1760183719173",
                "bank_name": "Mock Bank",
                "frequency": 1,
                "order_ref": "URF_1760183718951_5867135",
                "created_at": "2025-10-11 11:55:19 AM",
                "expiry_date": "N/A",
                "response_code": "02",
                "account_number": "0690000040",
                "account_status": "active",
                "response_message": "Transaction in progress"
            }
        }

        const amount = 100; // 1 NGN (in kobo)
        const currency = 'NGN';

        console.log('Testing payout with the following data:');
        console.log('Account:', fiatAccount);
        console.log('Amount:', amount);
        console.log('Currency:', currency);

        // Call the initiatePayout method
        const result = await paymentService.initiatePayout(
            fiatAccount as any,
            amount,
            currency
        );

        console.log('Payout initiated successfully:');
        console.log(result);
    } catch (error) {
        console.error('Payout test failed:');
        console.error(error.response?.data || error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the test
testPayout().catch(console.error);
