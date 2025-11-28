import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Ensure a user exists in the database. Throws NotFoundException if not.
 */
export async function ensureUserExists(prisma: PrismaService, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundException('User not found');
  }
  return user;
}
