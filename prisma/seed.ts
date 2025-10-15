import {
  PrismaClient,
  UserRole,
  AccountStatus,
  VerificationStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Hash passwords
  const password = await bcrypt.hash('password', 12);

  // Create users with different roles and statuses
  const users = await Promise.all([
    // Admin users
    prisma.user.upsert({
      where: { email: 'admin@sync.com' },
      update: {},
      create: {
        email: 'admin@sync.com',
        password,
        firstName: 'Admin',
        lastName: 'User',
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.VERIFIED,
        phoneNumber: '+2348012345678',
        dateOfBirth: new Date('1990-01-01'),
        address: '123 Admin Street',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        postalCode: '100001',
      },
    }),
    prisma.user.upsert({
      where: { email: 'superadmin@sync.com' },
      update: {},
      create: {
        email: 'superadmin@sync.com',
        password,
        firstName: 'Super',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.VERIFIED,
        twoFactorEnabled: true,
        twoFactorSecret: 'SUPERSECRET123',
      },
    }),

    // Regular users with different statuses
    prisma.user.upsert({
      where: { email: 'verified@sync.com' },
      update: {},
      create: {
        email: 'verified@sync.com',
        password,
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.USER,
        status: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.VERIFIED,
        phoneNumber: '+2348023456789',
      },
    }),
    prisma.user.upsert({
      where: { email: 'pending@sync.com' },
      update: {},
      create: {
        email: 'pending@sync.com',
        password,
        firstName: 'Jane',
        lastName: 'Smith',
        role: UserRole.USER,
        status: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.PENDING,
      },
    }),
    prisma.user.upsert({
      where: { email: 'suspended@sync.com' },
      update: {},
      create: {
        email: 'suspended@sync.com',
        password,
        firstName: 'Suspended',
        lastName: 'User',
        role: UserRole.USER,
        status: AccountStatus.SUSPENDED,
        verificationStatus: VerificationStatus.VERIFIED,
      },
    }),

    // System user
    prisma.user.upsert({
      where: { email: 'system@sync.com' },
      update: {},
      create: {
        email: 'system@sync.com',
        password,
        firstName: 'System',
        lastName: 'User',
        role: UserRole.SYSTEM,
        status: AccountStatus.ACTIVE,
        verificationStatus: VerificationStatus.VERIFIED,
      },
    }),
  ]);

  // Create fiat accounts for verified users
  const verifiedUsers = users.filter(
    (u) => u.verificationStatus === VerificationStatus.VERIFIED,
  );

  for (const user of verifiedUsers) {
    await prisma.fiatAccount.createMany({
      data: [
        {
          userId: user.id,
          provider: 'monnify',
          accountNumber: '1234567890',
          accountName: `${user.firstName} ${user.lastName}`,
          bankName: 'Wema Bank',
          bankCode: '035',
          balance: 1000000, // 1M NGN
          currency: 'NGN',
          isDefault: true,
          contractCode: 'CONTRACT123',
          accountReference: `REF-${user.id}`,
          reservationReference: `RESV-${user.id}`,
          customerEmail: user.email,
          customerName: `${user.firstName} ${user.lastName}`,
        },
        {
          userId: user.id,
          provider: 'monnify',
          accountNumber: '0987654321',
          accountName: `${user.firstName} ${user.lastName}`,
          bankName: 'Providus Bank',
          bankCode: '101',
          balance: 500000, // 500K NGN
          currency: 'NGN',
          isDefault: false,
        },
      ],
    });

    // Create crypto wallets
    await prisma.cryptoWallet.createMany({
      data: [
        {
          userId: user.id,
          network: 'starknet',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          encryptedPrivateKey: 'ENCRYPTED_PRIVATE_KEY',
          currency: 'ETH',
          isDefault: true,
        },
        {
          userId: user.id,
          network: 'starknet',
          address: '0xabcdef1234567890abcdef1234567890abcdef12',
          encryptedPrivateKey: 'ENCRYPTED_PRIVATE_KEY',
          currency: 'USDC',
          isDefault: false,
        },
      ],
    });
  }

  // Create transactions for the first verified user
  const mainUser = verifiedUsers[0];
  const userFiatAccount = await prisma.fiatAccount.findFirst({
    where: { userId: mainUser.id, isDefault: true },
  });
  const userCryptoWallet = await prisma.cryptoWallet.findFirst({
    where: { userId: mainUser.id, isDefault: true },
  });

  // Create different types of transactions
  const transactionTypes = ['deposit', 'withdrawal', 'swap', 'transfer'];
  const transactionStatuses = ['pending', 'completed', 'failed', 'reversed'];

  for (let i = 0; i < 20; i++) {
    const type = transactionTypes[i % transactionTypes.length];
    const status = transactionStatuses[i % transactionStatuses.length];
    const amount = Math.floor(Math.random() * 1000000) + 10000; // Random amount between 10K and 1M
    const fee = amount * 0.015; // 1.5% fee

    await prisma.transaction.create({
      data: {
        userId: mainUser.id,
        type,
        status,
        amount,
        currency: type === 'deposit' ? 'NGN' : 'USDC',
        fee,
        netAmount: amount - fee,
        reference: `TRX-${Date.now()}-${i}`,
        metadata: {
          description: `Sample ${type} transaction`,
          provider: type === 'deposit' ? 'monnify' : 'starknet',
        },
        fiatAccountId: userFiatAccount?.id,
        cryptoWalletId: userCryptoWallet?.id,
        completedAt: status === 'completed' ? new Date() : null,
      },
    });
  }

  // Create swap orders
  const swapStatuses = ['pending', 'completed', 'failed', 'partial'];
  for (let i = 0; i < 10; i++) {
    const status = swapStatuses[i % swapStatuses.length];
    const fromAmount = Math.floor(Math.random() * 1000000) + 10000;
    const rate = 1200; // 1 USDC = 1200 NGN
    const fee = fromAmount * 0.02; // 2% fee

    await prisma.swapOrder.create({
      data: {
        userId: mainUser.id,
        fromCurrency: i % 2 === 0 ? 'NGN' : 'USDC',
        toCurrency: i % 2 === 0 ? 'USDC' : 'NGN',
        fromAmount,
        toAmount:
          i % 2 === 0 ? (fromAmount - fee) / rate : (fromAmount - fee) * rate,
        rate,
        fee,
        status,
        reference: `SWAP-${Date.now()}-${i}`,
        completedAt: status === 'completed' ? new Date() : null,
      },
    });
  }

  // Create sessions for all users
  for (const user of users) {
    await prisma.session.create({
      data: {
        userId: user.id,
        token: `session-${user.id}`,
        ipAddress: '127.0.0.1',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h
        deviceInfo: {
          os: 'Windows',
          browser: 'Chrome',
          device: 'Desktop',
        },
      },
    });
  }

  // Create audit logs
  const auditActions = [
    'USER_LOGIN',
    'USER_LOGOUT',
    'PROFILE_UPDATE',
    'PASSWORD_CHANGE',
    'TRANSACTION_CREATED',
    'KYC_SUBMITTED',
    'ACCOUNT_VERIFIED',
  ];

  for (let i = 0; i < 30; i++) {
    const user = users[i % users.length];
    const action = auditActions[i % auditActions.length];

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action,
        entityType: 'User',
        entityId: user.id,
        metadata: {
          timestamp: new Date().toISOString(),
          details: `Sample ${action} audit log`,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'seed-script',
      },
    });
  }

  // Create system settings
  const systemSettings = [
    {
      key: 'site_name',
      value: { en: 'Sync Liquidity Bridge' },
      description: 'Platform name',
    },
    {
      key: 'maintenance_mode',
      value: { enabled: false, message: 'System under maintenance' },
      description: 'Maintenance mode configuration',
    },
    {
      key: 'transaction_fees',
      value: {
        deposit: { percentage: 1.5, min: 100, max: 2000 },
        withdrawal: { percentage: 1, min: 50, max: 1000 },
        swap: { percentage: 2, min: 200, max: 5000 },
      },
      description: 'Transaction fee configuration',
    },
    {
      key: 'kyc_requirements',
      value: {
        minimum_age: 18,
        required_documents: ['government_id', 'proof_of_address', 'selfie'],
        allowed_countries: ['Nigeria', 'Ghana', 'Kenya'],
      },
      description: 'KYC verification requirements',
    },
  ];

  for (const setting of systemSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  console.log('Seed data created successfully');
  console.log('Created users:', users.map((u) => u.email).join(', '));
}

async function runSeed() {
  try {
    await main();
  } catch (e) {
    console.error('Error during seeding:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void runSeed();
