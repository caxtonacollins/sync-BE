import { Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogController } from './audit-log.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
