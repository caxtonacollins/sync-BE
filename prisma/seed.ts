import { Prisma, PrismaClient, UserRole, VerificationStatus, AccountStatus, TransactionType, TransactionStatus, StakeStatus, SwapType } from '@prisma/client';
import { hash } from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data (be careful in production)
  if (process.env.NODE_ENV !== 'production') {
    console.log('🧹 Clearing existing data...');
    await prisma.$transaction([
      prisma.authChallenge.deleteMany(),
      prisma.auditLog.deleteMany(),
      prisma.transaction.deleteMany(),
      prisma.swapOrder.deleteMany(),
      prisma.cryptoStake.deleteMany(),
      prisma.cryptoStakingPool.deleteMany(),
      prisma.cryptoBalance.deleteMany(),
      prisma.cryptoWallet.deleteMany(),
      prisma.encryptedKey.deleteMany(),
      prisma.passkeyAuthenticator.deleteMany(),
      prisma.session.deleteMany(),
      prisma.user.deleteMany(),
      prisma.liquidityPool.deleteMany(),
      prisma.poolHistory.deleteMany(),
      prisma.exchangeRate.deleteMany(),
      prisma.systemSetting.deleteMany(),
    ]);
  }

  // Create system settings
  console.log('⚙️ Creating system settings...');
  await prisma.systemSetting.createMany({
    data: [
      {
        key: 'maintenanceMode',
        value: false,
        description: 'Whether the system is in maintenance mode',
      },
      {
        key: 'withdrawalFeeBps',
        value: 30, // 0.3%
        description: 'Withdrawal fee in basis points (1/100th of a percent)',
      },
      {
        key: 'referralBonusBps',
        value: 100, // 1%
        description: 'Referral bonus in basis points (1/100th of a percent)',
      },
    ],
    skipDuplicates: true,
  });

  // Create exchange rates
  console.log('💱 Creating exchange rates...');
  await prisma.exchangeRate.createMany({
    data: [
      { fiatSymbol: 'NGN', tokenSymbol: 'USDT', rate: 0.00067 },
      { fiatSymbol: 'NGN', tokenSymbol: 'USDC', rate: 0.00067 },
      { fiatSymbol: 'NGN', tokenSymbol: 'ETH', rate: 0.00000042 },
      { fiatSymbol: 'NGN', tokenSymbol: 'STRK', rate: 0.00021 },
    ],
    skipDuplicates: true,
  });

  // Create admin user
  console.log('👑 Creating admin user...');
  const adminPassword = await hash('Admin@123', 10);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@sync.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      phoneNumber: '+2348000000000',
      role: UserRole.ADMIN,
      verificationStatus: VerificationStatus.VERIFIED,
      status: AccountStatus.ACTIVE,
      twoFactorEnabled: false,
      bvn: '12345678901',
      dateOfBirth: new Date('1990-01-01'),
      address: '1 Admin Street',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      postalCode: '100001',
      idType: 'nin',
      idNumber: '12345678901',
      starknetAccountAddress: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    },
  });

  // Create regular users
  console.log('👥 Creating regular users...');
  const users: Prisma.UserCreateInput[] = [];
  const userPasswords: Array<{ email: string; password: string }> = [];
  const testPasswords = [
    'User1@123',
    'User2@123',
    'User3@123',
    'User4@123',
    'User5@123',
  ];

  for (let i = 1; i <= 5; i++) {
    const hashedPassword = await hash(testPasswords[i - 1], 10);
    userPasswords.push({ email: `user${i}@example.com`, password: testPasswords[i - 1] });
    
    const user = await prisma.user.create({
      data: {
        email: `user${i}@example.com`,
        password: hashedPassword,
        firstName: `User${i}`,
        lastName: `Last${i}`,
        phoneNumber: `+234800000000${i}`,
        role: UserRole.USER,
        verificationStatus: i % 2 === 0 ? VerificationStatus.VERIFIED : VerificationStatus.PENDING,
        status: AccountStatus.ACTIVE,
        twoFactorEnabled: i % 3 === 0,
        bvn: `1234567890${i}`,
        dateOfBirth: new Date(1990 + i, i % 12, (i * 2) % 28 + 1),
        address: `${i} User Street`,
        city: i % 2 === 0 ? 'Lagos' : 'Abuja',
        state: i % 2 === 0 ? 'Lagos' : 'Abuja',
        country: 'Nigeria',
        postalCode: `10000${i}`,
        idType: i % 2 === 0 ? 'nin' : 'passport',
        idNumber: `ID1234567${i}`,
        starknetAccountAddress: `0x${i.toString().repeat(64 - i.toString().length)}${i}`.slice(0, 64),
      },
    });
    users.push(user);
  }

  // Create staking pools
  console.log('💰 Creating staking pools...');
  const pools = await Promise.all(
    [
      {
        tokenSymbol: 'STRK',
        tokenAddress: '0x123...',
        network: 'starknet',
        baseApyBps: 800, // 8%
        bonusApyBps: 400, // 4%
        minStakeAmount: 100,
        maxStakeAmount: 100000,
        isActive: true,
      },
      {
        tokenSymbol: 'ETH',
        tokenAddress: '0x456...',
        network: 'ethereum',
        baseApyBps: 500, // 5%
        bonusApyBps: 200, // 2%
        minStakeAmount: 0.1,
        maxStakeAmount: 1000,
        isActive: true,
      },
      {
        tokenSymbol: 'USDC',
        tokenAddress: '0x789...',
        network: 'starknet',
        baseApyBps: 1000, // 10%
        bonusApyBps: 500, // 5%
        minStakeAmount: 100,
        maxStakeAmount: 1000000,
        isActive: true,
      },
    ].map((pool) =>
      prisma.cryptoStakingPool.create({
        data: pool,
      })
    )
  );

  // Create crypto wallets and balances for users
  console.log('💼 Creating wallets and balances...');
  const tokens = ['STRK', 'ETH', 'USDC', 'USDT'];
  
  for (const user of [admin, ...users]) {
    // Create encrypted key for each user (in a real app, this would be properly encrypted)
    await prisma.encryptedKey.create({
      data: {
        userId: user.id as string,
        encryptedPrivateKey: `encrypted_${user.id}_private_key`,
        encryptedUserKey: `encrypted_${user.id}_user_key`,
        iv: 'initialization_vector',
        authTag: 'auth_tag',
        masterAuthTag: 'master_auth_tag',
      },
    });

    // Create wallets and balances for each token
    for (const token of tokens) {
      const network = token === 'ETH' ? 'ethereum' : 'starknet';
      const wallet = await prisma.cryptoWallet.create({
        data: {
          userId: user.id as string,
          network,
          address: `0x${Math.random().toString(16).substring(2, 42)}`,
          encryptedPrivateKey: `encrypted_${user.id}_${token}_private_key`,
          tokenSymbol: token,
          isDefault: token === 'STRK',
          isActive: true,
          isRegisteredToLiquidity: Math.random() > 0.5,
        },
      });

      // Create initial balance
      const baseAmount = Math.random() * 10000 + 100;
      await prisma.cryptoBalance.create({
        data: {
          userId: user.id as string,
          tokenSymbol: token,
          network,
          available: baseAmount * 0.8, // 80% available
          staked: baseAmount * 0.15,   // 15% staked
          pending: baseAmount * 0.05,  // 5% pending
        },
      });

      // Create some transactions
      const transactionTypes = Object.values(TransactionType);
      const statuses = Object.values(TransactionStatus);
      
      // Create 5-10 random transactions per token
      const transactionCount = Math.floor(Math.random() * 6) + 5;
      for (let i = 0; i < transactionCount; i++) {
        const amount = Math.random() * 1000 + 1;
        const fee = amount * 0.01; // 1% fee
        const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        
        await prisma.transaction.create({
          data: {
            userId: user.id as string,
            type,
            status,
            amount,
            tokenSymbol: token,
            fee,
            netAmount: amount - fee,
            reference: `tx_${Date.now()}_${i}`,
            metadata: {
              walletAddress: wallet.address,
              network,
              confirmations: status === 'COMPLETED' ? 12 : Math.floor(Math.random() * 12),
            },
            cryptoWalletId: wallet.id,
            ...(status === 'COMPLETED' ? { completedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) } : {}),
            ...(status === 'COMPLETED' ? { transactionHash: `0x${Math.random().toString(16).substring(2, 66)}` } : {}),
          },
        });
      }
    }
  }

  // Create staking positions for some users
  console.log('🏦 Creating staking positions...');
  const stakingUsers = users.slice(0, 3); // First 3 users will have staking positions
  
  for (const user of stakingUsers) {
    const pool = pools[Math.floor(Math.random() * pools.length)];
    const amount = Math.random() * 1000 + 100;
    const lockDays = [30, 60, 90, 180, 365][Math.floor(Math.random() * 5)];
    const unlockAt = new Date();
    unlockAt.setDate(unlockAt.getDate() + lockDays);
    
    await prisma.cryptoStake.create({
      data: {
        userId: user.id as string,
        poolId: pool.id,
        tokenSymbol: pool.tokenSymbol,
        amount,
        lockDays,
        lockDurationSeconds: lockDays * 24 * 60 * 60,
        unlockAt,
        baseApyBps: pool.baseApyBps,
        bonusApyBps: pool.bonusApyBps,
        effectiveApyBps: pool.baseApyBps + (Math.random() * pool.bonusApyBps),
        status: Math.random() > 0.2 ? StakeStatus.ACTIVE : StakeStatus.UNSTAKED,
        ...(Math.random() > 0.2 ? { onChainTxHash: `0x${Math.random().toString(16).substring(2, 66)}` } : {}),
        onChainRecorded: Math.random() > 0.5,
      },
    });
  }

  // Create liquidity pools
  console.log('💧 Creating liquidity pools...');
  const liquidityPools = await Promise.all(
    [
      { symbol: 'NGN', type: 'fiat', balance: 1000000 },
      { symbol: 'USDC', type: 'token', balance: 50000 },
      { symbol: 'USDT', type: 'token', balance: 30000 },
    ].map((pool) =>
      prisma.liquidityPool.create({
        data: pool,
      })
    )
  );

  // Create pool history
  for (const pool of liquidityPools) {
    // Create 10 historical entries per pool
    for (let i = 0; i < 10; i++) {
      const amount = Math.random() * 10000 + 1000;
      const type = Math.random() > 0.5 ? 'add' : 'remove';
      
      await prisma.poolHistory.create({
        data: {
          poolId: pool.id,
          amount: type === 'add' ? amount : -amount,
          type,
          transactionHash: `0x${Math.random().toString(16).substring(2, 66)}`,
          blockNumber: (1000000 + i).toString(),
          timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  // Create audit logs
  console.log('📝 Creating audit logs...');
  const actions = ['LOGIN', 'LOGOUT', 'PASSWORD_CHANGE', 'PROFILE_UPDATE', 'WITHDRAWAL', 'DEPOSIT'];
  
  for (let i = 0; i < 50; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action,
        entityType: Math.random() > 0.5 ? 'USER' : 'TRANSACTION',
        entityId: Math.random() > 0.5 ? user.id : undefined,
        metadata: {
          ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
          userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * 20) + 90}.0.4430.212 Safari/537.36`,
        },
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * 20) + 90}.0.4430.212 Safari/537.36`,
      },
    });
  }

  console.log('✅ Database seeded successfully!');
  
  // Log test user credentials
  console.log('\nTest user credentials:');
  userPasswords.forEach(({ email, password }) => {
    console.log(`Email: ${email} | Password: ${password}`);
  });
  console.log('Admin credentials:');
  console.log(`Email: admin@sync.com | Password: Admin@123`);
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
