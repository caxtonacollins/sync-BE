import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { AccountStatus } from '@prisma/client';
import { SessionService } from '../session/session.service';
import { KeyManagementService } from './key-management.service';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { ethers } from 'ethers';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30; // minutes

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private sessionService: SessionService,
    private readonly keyManagementService: KeyManagementService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      return null;
    }

    // Check account status
    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Check for account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account is temporarily locked. Please try again later.',
      );
    }

    // Validate password
    const isValidPassword = await bcrypt.compare(pass, user.password);

    if (!isValidPassword) {
      // Increment login attempts
      const loginAttempts = user.loginAttempts + 1;
      const updates: any = { loginAttempts };

      if (loginAttempts >= this.MAX_LOGIN_ATTEMPTS) {
        updates.lockedUntil = new Date(
          Date.now() + this.LOCKOUT_DURATION * 60 * 1000,
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: updates,
      });

      return null;
    }

    // Reset login attempts on successful login
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
      },
    });

    const { ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto, ipAddress: string, userAgent: string) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!loginDto.twoFactorCode) {
        throw new BadRequestException('2FA code is required');
      }

      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: loginDto.twoFactorCode,
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    // Generate tokens
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id, email: user.email },
        { expiresIn: '15m' },
      ),
      this.jwtService.signAsync(
        { sub: user.id, email: user.email },
        { expiresIn: '7d' },
      ),
    ]);

    // Create session
    await this.sessionService.create({
      user: { connect: { id: user.id } },
      token: refreshToken,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: {
        userAgent,
        ipAddress,
        lastActive: new Date(),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async generate2FASecret(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = speakeasy.generateSecret({
      name: `SyncApp:${user.email}`,
    });

    // Store the secret temporarily (will be confirmed when 2FA is enabled)
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    // Generate QR code
    if (!secret.otpauth_url) {
      throw new Error('Failed to generate OTP authentication URL');
    }
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
    };
  }

  async enable2FA(userId: string, otpCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorSecret) {
      throw new NotFoundException('User not found or 2FA not initialized');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: otpCode,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  async verify2FA(userId: string, otpCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.twoFactorSecret || !user.twoFactorEnabled) {
      throw new UnauthorizedException('2FA is not enabled for this user');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: otpCode,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    return { message: '2FA verification successful' };
  }

  async disable2FA(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });

    return { message: '2FA disabled successfully' };
  }

  // Wallet Management Methods
  async createWallet(userId: string) {
    const wallet = ethers.Wallet.createRandom();

    try {
      // Store the encrypted private key
      await this.keyManagementService.storePrivateKey(
        userId,
        wallet.privateKey,
      );

      // Store the public address
      await this.prisma.cryptoWallet.create({
        data: {
          userId,
          address: wallet.address,
          network: 'ethereum',
          currency: 'ETH',
          isActive: true,
        },
      });

      return { address: wallet.address };
    } catch (error) {
      throw new BadRequestException(
        `Failed to create wallet for user: ${error.message}`,
      );
    }
  }

  async importWallet(userId: string, privateKey: string) {
    try {
      const wallet = new ethers.Wallet(privateKey);

      // Store the encrypted private key
      await this.keyManagementService.storePrivateKey(
        userId,
        wallet.privateKey,
      );

      // Store the public address
      await this.prisma.cryptoWallet.create({
        data: {
          userId,
          address: wallet.address,
          network: 'ethereum',
          currency: 'ETH',
          isActive: true,
        },
      });

      return { address: wallet.address };
    } catch (error) {
      throw new BadRequestException(`Invalid private key ${error.message}`);
    }
  }

  async getWallets(userId: string) {
    const wallets = await this.prisma.cryptoWallet.findMany({
      where: { userId },
      select: {
        id: true,
        address: true,
        network: true,
        currency: true,
        isActive: true,
        createdAt: true,
      },
    });

    return wallets;
  }
}
