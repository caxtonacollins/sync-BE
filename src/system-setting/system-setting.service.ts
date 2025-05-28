import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SystemSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.SystemSettingCreateInput) {
    return this.prisma.systemSetting.create({ data });
  }

  async findAll(params?: Prisma.SystemSettingFindManyArgs) {
    return this.prisma.systemSetting.findMany(params);
  }

  async findOne(id: string) {
    return this.prisma.systemSetting.findUnique({ where: { id } });
  }

  async findByKey(key: string) {
    return this.prisma.systemSetting.findUnique({ where: { key } });
  }

  async update(id: string, data: Prisma.SystemSettingUpdateInput) {
    return this.prisma.systemSetting.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.systemSetting.delete({ where: { id } });
  }
}
