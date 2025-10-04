import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = '317bff9c-0ff1-4a8d-a1c7-513613b73d5c';

  // First, verify that the user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error(`User with ID ${userId} not found`);
  }

  // Sample swap orders data
  const swapOrders = [
    {
      fromCurrency: 'NGN',
      toCurrency: 'USDC',
      fromAmount: 500000, // 500,000 NGN
      toAmount: 300, // 300 USDC
      rate: 1666.67, // Rate: 1 USDC = 1666.67 NGN
      fee: 2500, // 2,500 NGN fee
      status: 'completed',
      reference: `SWAP-${Date.now()}-1`,
    },
    {
      fromCurrency: 'USDC',
      toCurrency: 'NGN',
      fromAmount: 200, // 200 USDC
      toAmount: 320000, // 320,000 NGN
      rate: 1600, // Rate: 1 USDC = 1600 NGN
      fee: 1000, // 1,000 NGN fee
      status: 'completed',
      reference: `SWAP-${Date.now()}-2`,
    },
    {
      fromCurrency: 'NGN',
      toCurrency: 'USDC',
      fromAmount: 250000, // 250,000 NGN
      toAmount: 150, // 150 USDC
      rate: 1666.67,
      fee: 1250, // 1,250 NGN fee
      status: 'pending',
      reference: `SWAP-${Date.now()}-3`,
    },
  ];

  console.log('Creating swap orders...');

  // Create swap orders
  for (const orderData of swapOrders) {
    const swapOrder = await prisma.swapOrder.create({
      data: {
        userId,
        ...orderData,
        completedAt: orderData.status === 'completed' ? new Date() : null,
      },
    });

    // Create corresponding transactions for completed orders
    if (orderData.status === 'completed') {
      // Create debit transaction for fromCurrency
      await prisma.transaction.create({
        data: {
          userId,
          type: 'swap',
          status: 'completed',
          amount: -orderData.fromAmount,
          currency: orderData.fromCurrency,
          fee: orderData.fee,
          netAmount: -(orderData.fromAmount + orderData.fee),
          reference: `${orderData.reference}-FROM`,
          swapOrderId: swapOrder.id,
          completedAt: new Date(),
          metadata: {
            swapDetails: {
              fromCurrency: orderData.fromCurrency,
              toCurrency: orderData.toCurrency,
              rate: orderData.rate,
            },
          },
        },
      });

      // Create credit transaction for toCurrency
      await prisma.transaction.create({
        data: {
          userId,
          type: 'swap',
          status: 'completed',
          amount: orderData.toAmount,
          currency: orderData.toCurrency,
          fee: 0, // Fee is charged in fromCurrency
          netAmount: orderData.toAmount,
          reference: `${orderData.reference}-TO`,
          swapOrderId: swapOrder.id,
          completedAt: new Date(),
          metadata: {
            swapDetails: {
              fromCurrency: orderData.fromCurrency,
              toCurrency: orderData.toCurrency,
              rate: orderData.rate,
            },
          },
        },
      });
    }

    console.log(`Created swap order: ${swapOrder.id}`);
  }

  console.log('Seed completed successfully!');
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
