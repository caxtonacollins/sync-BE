import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FlutterwaveService } from './flutterwave.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FlutterwaveController } from './flutterwave.controller';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [FlutterwaveService, WebhookService, ConfigService],
  exports: [FlutterwaveService],
  controllers: [FlutterwaveController, WebhookController],
})
export class FlutterwaveModule {}
