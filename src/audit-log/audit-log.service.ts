import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.AuditLogCreateInput) {
    return this.prisma.auditLog.create({ data });
  }

  async findAll(params?: Prisma.AuditLogFindManyArgs) {
    return this.prisma.auditLog.findMany(params);
  }

  async findOne(id: string) {
    return this.prisma.auditLog.findUnique({ where: { id } });
  }

  async update(id: string, data: Prisma.AuditLogUpdateInput) {
    return this.prisma.auditLog.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.auditLog.delete({ where: { id } });
  }
}
