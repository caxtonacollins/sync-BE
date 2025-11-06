import { Module } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FlutterwaveController } from './flutterwave.controller';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  providers: [FlutterwaveService, WebhookService, ConfigService, PrismaService],
  exports: [FlutterwaveService],
  imports: [PrismaModule],
  controllers: [FlutterwaveController, WebhookController],
})
export class FlutterwaveModule {}
