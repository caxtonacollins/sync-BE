import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { Prisma } from '@prisma/client';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Post()
  create(@Body() data: Prisma.AuditLogCreateInput) {
    return this.auditLogService.create(data);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.auditLogService.findAll({ where: query });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auditLogService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: Prisma.AuditLogUpdateInput) {
    return this.auditLogService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.auditLogService.remove(id);
  }
}
