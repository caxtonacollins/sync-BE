import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Retrieve a user's Starknet account address or throw an Error if missing.
 * Centralizes the repeated pattern used by contract services.
 */
export async function getUserStarknetAddress(
  prisma: PrismaService,
  userId: string,
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { starknetAccountAddress: true },
  });

  if (!user?.starknetAccountAddress) {
    throw new Error('User must have a Starknet account address');
  }

  return user.starknetAccountAddress;
}
