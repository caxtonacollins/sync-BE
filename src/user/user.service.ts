import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { FiatAccountDto } from './dto/fiat-account.dto';
import { CryptoWalletDto } from './dto/crypto-wallet.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { UserFilterDto } from './dto/user-filter.dto';
import { Prisma, VerificationStatus, FiatAccount } from '@prisma/client';
import { PaginationDto } from './dto/pagination.dto';
import { FlutterwaveService } from 'src/payment/flutterwave/flutterwave.service';
import chalk from 'chalk';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { AccountContractService } from 'src/contract/services/account/account.service';
import { LiquidityPoolContractService } from 'src/contract/services/liquidity-pool/liquidity-pool.service';
import {
  CreateVirtualAccountDto,
  CreateVirtualAccountResponseDto,
} from './dto/create-virtual-account.dto';
import { VirtualAccountUser } from 'src/types';
import { BalanceSyncService } from 'src/shared/services/balance-sync.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private flutterwaveService: FlutterwaveService,
    private readonly accountContractService: AccountContractService,
    private readonly liquidityPoolContractService: LiquidityPoolContractService,
    private readonly balanceSyncService: BalanceSyncService,
  ) {}

  private readonly SALT_ROUNDS = 12;

  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async verifyPassword(plainText: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(plainText, hash);
  }

  async createUser(createUserDto: CreateUserDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Hash password and create user
      const passwordHash = await this.hashPassword(createUserDto.password);

      const user = await tx.user.create({
        data: {
          email: createUserDto.email,
          password: passwordHash,
          firstName: createUserDto.firstName,
          lastName: createUserDto.lastName,
          phoneNumber: createUserDto.phoneNumber,
          role: createUserDto.role,
          status: createUserDto.status || 'ACTIVE',
          verificationStatus: createUserDto.verificationStatus || 'PENDING',
        },
      });

      const { ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
  }

  async createCryptoAccounts(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Create StarkNet account
    try {
      const accountResult = await this.accountContractService.createAccount(
        user.id,
      );
      if (!accountResult) {
        throw new Error('Failed to create StarkNet account');
      }

      console.log(
        chalk.green(
          `StarkNet account created: ${accountResult.accountAddress}`,
        ),
      );

      await this.prisma.cryptoWallet.create({
        data: {
          userId: user.id,
          network: 'starknet',
          address: accountResult.accountAddress,
          encryptedPrivateKey: accountResult.encryptedPrivateKey,
          currency: 'STRK',
          isDefault: true,
        },
      });

      await this.balanceSyncService.initializeBalances(userId);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          starknetAccountAddress: accountResult.accountAddress,
        },
      });
    } catch (contractError) {
      console.error('StarkNet account creation failed:', contractError);
      throw contractError;
    }

    return { success: true, message: 'Accounts provisioned successfully' };
  }

  async createVirtualAccount(
    userId: string,
    createVirtualAccountDto: CreateVirtualAccountDto,
  ): Promise<CreateVirtualAccountResponseDto> {
    // Find the user first
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        bvn: true,
        nin: true,
        starknetAccountAddress: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Prepare update data with proper typing
    const updateData: {
      bvn?: string | null;
      nin?: string | null;
      updatedAt?: Date;
    } = { updatedAt: new Date() };

    if (createVirtualAccountDto.bvn) {
      updateData.bvn = createVirtualAccountDto.bvn;
    }
    if (createVirtualAccountDto.nin) {
      updateData.nin = createVirtualAccountDto.nin;
    }

    // Only update if there are fields to update
    if (Object.keys(updateData).length > 1) {
      await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });
    }

    // Check if user already has a virtual account
    const existingAccount = await this.prisma.fiatAccount.findFirst({
      where: {
        userId,
        provider: 'flutterwave',
        currency: 'NGN',
      },
    });

    if (existingAccount) {
      return {
        success: true,
        message: 'Virtual account already exists',
        account: existingAccount as unknown as Record<string, any>,
      };
    }

    // Create virtual account
    try {
      const userData = {
        ...user,
        bvn: createVirtualAccountDto.bvn || user.bvn || null,
        nin: createVirtualAccountDto.nin || user.nin || null,
      };

      const flutterwaveAccounts =
        await this.flutterwaveService.createVirtualAccounts(
          userData as VirtualAccountUser,
        );

      if (!flutterwaveAccounts || flutterwaveAccounts.length === 0) {
        throw new Error(
          'Failed to create virtual account: No accounts were created',
        );
      }

      const createdAccounts: FiatAccount[] = [];

      for (const fwAccount of flutterwaveAccounts) {
        if (fwAccount) {
          const accountData: Prisma.FiatAccountCreateInput = {
            id: undefined, // Let Prisma generate the ID
            provider: 'flutterwave',
            currency: fwAccount.currency || 'NGN',
            isDefault: true,
            accountNumber: fwAccount.account_number || '',
            accountName:
              fwAccount.account_name || `${user.firstName} ${user.lastName}`,
            bankName: fwAccount.bank_name || null,
            bankCode: fwAccount.bank_code || null,
            accountReference: fwAccount.tx_ref || null,
            balance: 0,
            availableBalance: 0,
            ledgerBalance: 0,
            isActive: true,
            user: {
              connect: { id: userId },
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const createdAccount = await this.prisma.fiatAccount.create({
            data: accountData,
          });
          createdAccounts.push(createdAccount);

          // Link to liquidity pool if this is the first account and user has a StarkNet account
          if (user.starknetAccountAddress) {
            await this.liquidityPoolContractService.registerUserToLiquidity(
              user.starknetAccountAddress,
              createdAccount.id,
            );
          }
        }
      }

      if (createdAccounts.length === 0) {
        throw new Error('Failed to save virtual account to database');
      }

      const defaultAccount = createdAccounts[0];

      return {
        success: true,
        message: 'Virtual account created successfully',
        account: defaultAccount as unknown as Record<string, any>,
      };
    } catch (error: any) {
      console.error('Failed to create virtual account:', error);
      throw new Error(`Failed to create virtual account: ${error.message}`);
    }
  }

  async findAll(filter: UserFilterDto): Promise<{
    data: any[];
    meta: {
      page: number;
      limit: number;
      total: number;
    };
  }> {
    const where: Prisma.UserWhereInput = {};

    if (filter.search) {
      where.OR = [
        { firstName: { contains: filter.search, mode: 'insensitive' } },
        { lastName: { contains: filter.search, mode: 'insensitive' } },
        { email: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.role) {
      where.role = filter.role;
    }

    if (filter.verificationStatus) {
      where.verificationStatus = filter.verificationStatus;
    }

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.email) {
      where.email = filter.email;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: filter.skip,
        take: filter.limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }),
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
      },
    };
  }

  async findOne(
    id: string,
    fiatAccounts?: boolean,
    cryptoWallets?: boolean,
    transactions?: boolean,
    swapOrders?: boolean,
  ) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        fiatAccounts: fiatAccounts || false,
        cryptoWallets: cryptoWallets || false,
        transactions: transactions || false,
        swapOrders: swapOrders || false,
      },
    });
  }

  async getUserByCryptoAddress(address: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        cryptoWallets: {
          some: {
            address: {
              equals: address,
              mode: 'insensitive',
            },
          },
        },
      },
      include: {
        cryptoWallets: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User with crypto address ${address} not found`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getByEmail(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }
    return null;
  }

  async getById(id: string, include?: Prisma.UserInclude) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getUserFiatAccounts(userId: string, pagination: PaginationDto) {
    const [accounts, total] = await Promise.all([
      this.prisma.fiatAccount.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fiatAccount.count({ where: { userId } }),
    ]);

    return {
      data: accounts,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
      },
    };
  }

  async getUserCryptoWallets(userId: string, pagination: PaginationDto) {
    const [wallets, total] = await Promise.all([
      this.prisma.cryptoWallet.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cryptoWallet.count({ where: { userId } }),
    ]);

    return {
      data: wallets,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
      },
    };
  }

  async getUserTransactions(userId: string, pagination: PaginationDto) {
    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          fiatAccount: true,
          cryptoWallet: true,
          swapOrder: true,
        },
      }),
      this.prisma.transaction.count({ where: { userId } }),
    ]);

    return {
      data: transactions,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
      },
    };
  }

  async getUserSwapOrders(userId: string, pagination: PaginationDto) {
    const [orders, total] = await Promise.all([
      this.prisma.swapOrder.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          transactions: true,
        },
      }),
      this.prisma.swapOrder.count({ where: { userId } }),
    ]);

    return {
      data: orders,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
      },
    };
  }

  async update(id: string, UpdateUserDto: UpdateUserDto) {
    return await this.prisma.user.update({
      where: { id },
      data: UpdateUserDto,
    });
  }

  async updatePassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

    const user = await this.prisma.user.update({
      where: { id },
      data: { password: passwordHash },
    });

    return user;
  }

  // --- Payment PIN management ---
  private hashPin(pin: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(pin, salt, 32).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPin(pin: string, stored: string): boolean {
    const [salt, storedHash] = stored.split(':');
    const computed = scryptSync(pin, salt, 32).toString('hex');
    return timingSafeEqual(
      Buffer.from(storedHash, 'hex'),
      Buffer.from(computed, 'hex'),
    );
  }

  async setPaymentPin(userId: string, pin: string) {
    const hash = this.hashPin(pin);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        paymentPinHash: hash,
        paymentPinAttempts: 0,
        paymentPinLockedUntil: null,
      } as any,
    });
    return { success: true };
  }

  async verifyPaymentPin(userId: string, pin: string) {
    const user: any = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.paymentPinLockedUntil && user.paymentPinLockedUntil > new Date()) {
      return { success: false, lockedUntil: user.paymentPinLockedUntil };
    }

    if (!user.paymentPinHash) return { success: false };

    const ok = this.verifyPin(pin, user.paymentPinHash);
    if (!ok) {
      const attempts = (user.paymentPinAttempts || 0) + 1;
      let lockedUntil: Date | null = null;
      if (attempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          paymentPinAttempts: lockedUntil ? 0 : attempts,
          paymentPinLockedUntil: lockedUntil,
        } as any,
      });
      return { success: false, lockedUntil };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { paymentPinAttempts: 0, paymentPinLockedUntil: null } as any,
    });
    return { success: true };
  }

  async changePaymentPin(userId: string, oldPin: string, newPin: string) {
    const verify = await this.verifyPaymentPin(userId, oldPin);
    if (!verify.success)
      return { success: false, lockedUntil: verify.lockedUntil };
    const hash = this.hashPin(newPin);
    await this.prisma.user.update({
      where: { id: userId },
      data: { paymentPinHash: hash } as any,
    });
    return { success: true };
  }

  async verifyUserKyc(
    id: string,
    verificationData: {
      verificationStatus: VerificationStatus;
      verificationNotes?: string;
    },
  ) {
    await this.prisma.user.update({
      where: { id },
      data: {
        verificationStatus: verificationData.verificationStatus,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'KYC_VERIFICATION',
        entityType: 'User',
        entityId: id,
        userId: id,
        metadata: {
          status: verificationData.verificationStatus,
          notes: verificationData.verificationNotes,
        },
      },
    });
  }

  async remove(id: string) {
    return this.prisma.$transaction(async (prisma) => {
      // First delete all related FiatAccount records
      await prisma.fiatAccount.deleteMany({
        where: { userId: id },
      });

      // Then delete all related CryptoWallet records
      await prisma.cryptoWallet.deleteMany({
        where: { userId: id },
      });

      // Then delete all related Transaction records
      await prisma.transaction.deleteMany({
        where: { userId: id },
      });

      // Then delete all related SwapOrder records
      await prisma.swapOrder.deleteMany({
        where: { userId: id },
      });

      // Then delete all related AuditLog records
      await prisma.auditLog.deleteMany({
        where: { userId: id },
      });

      // Then delete all related EncryptedKey records
      await prisma.encryptedKey.deleteMany({
        where: { userId: id },
      });

      // Then delete all related Session records
      await prisma.session.deleteMany({
        where: { userId: id },
      });

      // Then delete the user and return without the password
      const deletedUser = await prisma.user.delete({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          role: true,
          status: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true,
          lastLogin: true,
          dateOfBirth: true,
          address: true,
          city: true,
          state: true,
          country: true,
          postalCode: true,
          idType: true,
          idNumber: true,
          idFrontImage: true,
          idBackImage: true,
          selfieImage: true,
          twoFactorEnabled: true,
          loginAttempts: true,
          lockedUntil: true,
        },
      });

      return deletedUser;
    });
  }

  async resolveAccountNumber(accountNumber: string) {
    // Check if account exists in our database (SyncPayment internal account)
    const fiatAccount = await this.prisma.fiatAccount.findFirst({
      where: { accountNumber },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
    console.log('fiatAccount', fiatAccount);

    if (fiatAccount) {
      // Internal SyncPayment account found
      return {
        isSyncPayment: true,
        accountNumber: fiatAccount.accountNumber,
        accountName: fiatAccount.accountName,
        bankName: 'SyncPayment',
        bankCode: 'SYNC001',
        user: fiatAccount.user,
      };
    }

    // Not a SyncPayment account - return null to indicate external account
    return null;
  }
}
