/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { FiatAccountDto } from './dto/fiat-account.dto';
import { CryptoWalletDto } from './dto/crypto-wallet.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { UserFilterDto } from './dto/user-filter.dto';
import { Prisma, VerificationStatus } from '@prisma/client';
import { PaginationDto } from './dto/pagination.dto';
import { MonnifyService } from 'src/monnify/monnify.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private monnifyService: MonnifyService,
  ) {}

  private readonly SALT_ROUNDS = 12;

  async hashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async verifyPassword(plainText: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(plainText, hash);
  }

  async createFiatAccount(fiatAccountDto: FiatAccountDto) {
    return this.prisma.fiatAccount.create({
      data: fiatAccountDto,
    });
  }

  async createCryptoWallet(cryptoWalletDto: CryptoWalletDto) {
    return this.prisma.cryptoWallet.create({
      data: cryptoWalletDto,
    });
  }

  async createUser(createUserDto: CreateUserDto) {
    // Wrap the whole flow in a single Prisma transaction so user + accounts are atomic
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
          status: createUserDto.status,
          verificationStatus: createUserDto.verificationStatus,
        },
      });

      // 2. Create a default fiat account for the user (placeholder – provider integration TBD)
      await tx.fiatAccount.create({
        data: {
          userId: user.id,
          provider: 'manual',
          accountNumber: `ACC-${Date.now()}`,
          accountName: `${user.firstName} ${user.lastName}`,
          currency: 'NGN',
          isDefault: true,
        },
      });

      // 3. Create a default crypto wallet for the user (address generation TBD)
      await tx.cryptoWallet.create({
        data: {
          userId: user.id,
          network: 'starknet',
          address: `0x${Math.random().toString(16).substring(2, 42)}`.padEnd(
            42,
            '0',
          ),
          currency: 'ETH',
          isDefault: true,
        },
      });

      // 4. Create Monnify reserve account for the user
      try {
        await this.monnifyService.createReserveAccount(user);
      } catch (error) {
        console.error('Failed to create Monnify account:', error);
        // We can retry this later or have a background job handle failures
      }

      return user;
    });
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
      data: users.map((user) => user),
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
      },
    };
  }

  async getByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async getById(id: string, include?: Prisma.UserInclude) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
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
    const user = await this.prisma.user.delete({
      where: { id },
    });

    return user;
  }
}
