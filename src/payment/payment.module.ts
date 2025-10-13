import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';

@Module({
  providers: [PaymentService, FlutterwaveService],
  exports: [PaymentService],
})
export class PaymentModule {}
