import { Module } from '@nestjs/common';
import { SyncPayController } from './syncpay.controller';
import { SyncPayService } from './syncpay.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SyncPayController],
  providers: [SyncPayService],
})
export class SyncPayModule {}
