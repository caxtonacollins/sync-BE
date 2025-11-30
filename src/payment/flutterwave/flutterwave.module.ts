import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FlutterwaveService } from './flutterwave.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentModule } from '../payment.module';
import { AuditLogModule } from 'src/audit-log/audit-log.module';
import { TransactionModule } from 'src/transaction/transaction.module';
import { WalletModule } from 'src/transaction/wallet/wallet.module';
import { FlutterwaveController } from './flutterwave.controller';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';

@Module({
      imports: [
    PrismaModule,
    ConfigModule,
    forwardRef(() => PaymentModule),
    AuditLogModule,
    forwardRef(() => TransactionModule),
    forwardRef(() => WalletModule),
  ],
  providers: [FlutterwaveService, WebhookService, ConfigService],
  exports: [FlutterwaveService],
  controllers: [FlutterwaveController, WebhookController],
})
export class FlutterwaveModule {}
