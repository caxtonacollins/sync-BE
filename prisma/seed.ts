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
  const adminPassword = await bcrypt.hash('AdminPass123!', 12);
  const userPassword = await bcrypt.hash('UserPass123!', 12);

  // Create users
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: adminPassword, // Changed from 'password' to 'passwordHash' to match your schema
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      status: AccountStatus.ACTIVE,
      verificationStatus: VerificationStatus.VERIFIED,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: userPassword,
      firstName: 'Regular',
      lastName: 'User',
      role: UserRole.USER,
      status: AccountStatus.ACTIVE,
      verificationStatus: VerificationStatus.PENDING,
    },
  });

  // Create system settings
  await prisma.systemSetting.upsert({
    where: { key: 'site_name' },
    update: {},
    create: {
      key: 'site_name',
      value: { en: 'Liquidity Bridge' }, // Changed to match your platform name
      description: 'The name of the platform',
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: 'maintenance_mode' },
    update: {},
    create: {
      key: 'maintenance_mode',
      value: { enabled: false },
      description: 'Maintenance mode flag',
    },
  });

  // Create a session for admin
  await prisma.session.create({
    data: {
      userId: admin.id,
      token: 'admin-session-token',
      ipAddress: '127.0.0.1',
      userAgent: 'seed-script',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24h
    },
  });

  // Create an audit log for user creation
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'SEED_DATA_CREATED',
      entityType: 'User',
      entityId: user.id,
      metadata: { action: 'Initial seed' },
      ipAddress: '127.0.0.1',
      userAgent: 'seed-script',
    },
  });

  console.log('Seed data created successfully:');
  console.log(`- Admin user created with email: ${admin.email}`);
  console.log(`- Regular user created with email: ${user.email}`);
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
