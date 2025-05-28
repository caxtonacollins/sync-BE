import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.SessionCreateInput) {
    return this.prisma.session.create({ data });
  }

  async findAll(params?: Prisma.SessionFindManyArgs) {
    return this.prisma.session.findMany(params);
  }

  async findOne(id: string) {
    return this.prisma.session.findUnique({ where: { id } });
  }

  async findByToken(token: string) {
    return this.prisma.session.findUnique({ where: { token } });
  }

  async update(id: string, data: Prisma.SessionUpdateInput) {
    return this.prisma.session.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.session.delete({ where: { id } });
  }
}
