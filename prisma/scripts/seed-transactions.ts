import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  const userId = '317bff9c-0ff1-4a8d-a1c7-513613b73d5c';

  // First, verify if the user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      fiatAccounts: true,
      cryptoWallets: true,
    },
  });

  if (!user) {
    console.error('User not found');
    process.exit(1);
  }

  // Create sample transactions
  const transactions = [
    // Deposit transactions
    {
      type: 'deposit',
      status: 'completed',
      amount: 100000,
      currency: 'NGN',
      fee: 50,
      netAmount: 99950,
      reference: uuidv4(),
      completedAt: new Date(),
      fiatAccountId: user.fiatAccounts[0]?.id, // Use the first fiat account if available
      metadata: {
        provider: 'monnify',
        paymentMethod: 'bank_transfer',
        description: 'Bank deposit',
      },
    },
    {
      type: 'deposit',
      status: 'completed',
      amount: 50000,
      currency: 'NGN',
      fee: 25,
      netAmount: 49975,
      reference: uuidv4(),
      completedAt: new Date(),
      fiatAccountId: user.fiatAccounts[0]?.id,
      metadata: {
        provider: 'monnify',
        paymentMethod: 'bank_transfer',
        description: 'Bank deposit',
      },
    },

    // Withdrawal transactions
    {
      type: 'withdrawal',
      status: 'completed',
      amount: 25000,
      currency: 'NGN',
      fee: 100,
      netAmount: 24900,
      reference: uuidv4(),
      completedAt: new Date(),
      fiatAccountId: user.fiatAccounts[0]?.id,
      metadata: {
        provider: 'monnify',
        paymentMethod: 'bank_transfer',
        description: 'Bank withdrawal',
      },
    },

    // Crypto transactions if user has crypto wallets
    ...(user.cryptoWallets[0]
      ? [
          {
            type: 'deposit',
            status: 'completed',
            amount: 100,
            currency: 'USDC',
            fee: 0.5,
            netAmount: 99.5,
            reference: uuidv4(),
            completedAt: new Date(),
            cryptoWalletId: user.cryptoWallets[0].id,
            metadata: {
              network: 'starknet',
              txHash: '0x' + uuidv4().replace(/-/g, ''),
              description: 'USDC deposit',
            },
          },
          {
            type: 'withdrawal',
            status: 'completed',
            amount: 50,
            currency: 'USDC',
            fee: 0.25,
            netAmount: 49.75,
            reference: uuidv4(),
            completedAt: new Date(),
            cryptoWalletId: user.cryptoWallets[0].id,
            metadata: {
              network: 'starknet',
              txHash: '0x' + uuidv4().replace(/-/g, ''),
              description: 'USDC withdrawal',
            },
          },
        ]
      : []),

    // Some pending transactions
    {
      type: 'deposit',
      status: 'pending',
      amount: 75000,
      currency: 'NGN',
      fee: 37.5,
      netAmount: 74962.5,
      reference: uuidv4(),
      fiatAccountId: user.fiatAccounts[0]?.id,
      metadata: {
        provider: 'monnify',
        paymentMethod: 'bank_transfer',
        description: 'Pending bank deposit',
      },
    },
  ];

  // Create all transactions
  const createdTransactions = await Promise.all(
    transactions.map((transaction) =>
      prisma.transaction.create({
        data: {
          ...transaction,
          userId,
        },
      }),
    ),
  );

  console.log(
    `Created ${createdTransactions.length} transactions for user ${userId}`,
  );
}

async function runSeedTx() {
  try {
    await main();
  } catch (e) {
    console.error('Error during seeding:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void runSeedTx();
