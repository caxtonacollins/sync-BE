import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { TokenContractService } from 'src/contract/services/erc20-token/erc20-token.service';
import { BalanceService } from 'src/payment/balance.service';
import { createHmac } from 'crypto';

describe('Flutterwave Webhooks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const WEBHOOK_SECRET = 'test-secret';

  beforeAll(async () => {
    process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = WEBHOOK_SECRET;
  });

  beforeEach(async () => {
    const mockTokenContract = {
      mintToken: jest.fn().mockResolvedValue({ transactionHash: '0xmint' }),
      burnToken: jest.fn().mockResolvedValue({ transactionHash: '0xburn' }),
      sngnTokenAddress: '0xsngn',
    };

    const mockBalanceService = {
      creditAccount: jest.fn().mockResolvedValue(true),
      debitAccount: jest.fn().mockResolvedValue(true),
    } as any;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TokenContractService)
      .useValue(mockTokenContract)
      .overrideProvider(BalanceService)
      .useValue(mockBalanceService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);

    // Clean relevant tables
    await prisma.transaction.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  it('processes BUY charge.completed -> mints and credits balance', async () => {
    // Create a user
    const user = await prisma.user.create({
      data: {
        email: 'buyer@test.local',
        firstName: 'Buyer',
        lastName: 'Test',
        password: 'password123',
      },
    });

    // Create a pending BUY transaction
    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'BUY',
        status: 'PENDING',
        amount: 100,
        tokenSymbol: 'sNGN',
        netAmount: 100,
        reference: `BUY-temp-${Date.now()}`,
        metadata: {},
      },
    });

    // Update to use BUY-{id} reference format
    const buyRef = `BUY-${tx.id}`;
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { reference: buyRef },
    });

    const payload = {
      event: 'charge.completed',
      data: {
        id: 'FLW1',
        tx_ref: buyRef,
        amount: 100,
        tokenSymbol: 'NGN',
        status: 'successful',
        customer: { id: user.id },
      },
    };

    const signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    const res = await request(app.getHttpServer())
      .post('/webhooks/flutterwave')
      .set('verif-hash', signature)
      .send(payload)
      .expect(200);

    expect(res.body).toBeDefined();

    const updated = await prisma.transaction.findUnique({
      where: { id: tx.id },
    });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('COMPLETED');
    expect(
      (updated!.metadata as any).mintTx || updated!.transactionHash,
    ).toBeDefined();
  });

  it('processes SELL transfer.completed -> finalizes sell (debit + burn)', async () => {
    // Create user
    const user = await prisma.user.create({
      data: {
        email: 'seller@test.local',
        firstName: 'Seller',
        lastName: 'Test',
        password: 'password123',
      },
    });

    // Create a SELL transaction with a payout-style reference
    const payoutRef = `PAYOUT_${Date.now()}_${user.id}`;
    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'SELL',
        status: 'PROCESSING',
        amount: 50,
        tokenSymbol: 'sNGN',
        netAmount: 50,
        reference: payoutRef,
        metadata: { payoutReference: payoutRef },
      },
    });

    const payload = {
      event: 'transfer.completed',
      data: {
        reference: payoutRef,
        status: 'SUCCESSFUL',
        amount: 50,
        tokenSymbol: 'NGN',
      },
    };

    const signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    const res = await request(app.getHttpServer())
      .post('/webhooks/flutterwave')
      .set('verif-hash', signature)
      .send(payload)
      .expect(200);

    expect(res.body).toBeDefined();

    const updated = await prisma.transaction.findUnique({
      where: { id: tx.id },
    });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('COMPLETED');
    const meta = updated!.metadata as any;

    // finalizeSell should have added burnTx and settled
    expect(meta.settled || meta.burnTx).toBeDefined();
  });
});
