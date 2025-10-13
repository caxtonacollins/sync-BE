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
        { sub: user.id, email: user.email, role: user.role },
        { expiresIn: '59m' },
      ),
      this.jwtService.signAsync(
        { sub: user.id, email: user.email, role: user.role },
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
      // Store the encrypted private key and get the encrypted version
      const encryptedKey = await this.keyManagementService.storePrivateKey(
        userId,
        wallet.privateKey,
      );

      // Store the public address with encrypted private key
      await this.prisma.cryptoWallet.create({
        data: {
          userId,
          address: wallet.address,
          network: 'ethereum',
          currency: 'ETH',
          isActive: true,
          encryptedPrivateKey: encryptedKey,
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

      // Store the encrypted private key and get the encrypted version
      const encryptedKey = await this.keyManagementService.storePrivateKey(
        userId,
        wallet.privateKey,
      );

      // Store the public address with encrypted private key
      await this.prisma.cryptoWallet.create({
        data: {
          userId,
          address: wallet.address,
          network: 'ethereum',
          currency: 'ETH',
          isActive: true,
          encryptedPrivateKey: encryptedKey,
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

  // Security Settings Methods
  async getSecurityStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get recent login sessions
    const recentSessions = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
    });

    return {
      mfaEnabled: user.twoFactorEnabled,
      passkeyEnabled: false, // TODO: Implement passkey support
      biometricsEnabled: false, // TODO: Implement biometric support
      lastPasswordChange: user.updatedAt.toISOString(),
      recentLogins: recentSessions.map((session) => ({
        date: session.createdAt.toISOString(),
        device: session.userAgent || 'Unknown Device',
        location: session.ipAddress || 'Unknown Location',
      })),
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async initializeMfa(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = speakeasy.generateSecret({
      name: `Sync:${user.email}`,
    });

    // Store the secret temporarily
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    // Generate QR code
    if (!secret.otpauth_url) {
      throw new Error('Failed to generate OTP authentication URL');
    }
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase(),
    );

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      backupCodes,
    };
  }

  async verifyMfaSetup(userId: string, code: string, secret: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.twoFactorSecret !== secret) {
      throw new BadRequestException('Invalid setup session');
    }

    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
    });

    if (!isValid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: 'MFA enabled successfully' };
  }

  async refreshToken(refreshToken: string) {
    try {
      // Verify the refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken);

      // Find the session with this refresh token
      const session = await this.sessionService.findByToken(refreshToken);

      if (!session) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        await this.sessionService.remove(session.id);
        throw new UnauthorizedException('Refresh token expired');
      }

      // Get user details
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== AccountStatus.ACTIVE) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Generate new tokens
      const [newAccessToken, newRefreshToken] = await Promise.all([
        this.jwtService.signAsync(
          { sub: user.id, email: user.email, role: user.role },
          { expiresIn: '15m' },
        ),
        this.jwtService.signAsync(
          { sub: user.id, email: user.email, role: user.role },
          { expiresIn: '7d' },
        ),
      ]);

      // Update session with new refresh token
      await this.sessionService.update(session.id, {
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        deviceInfo: {
          ...(session.deviceInfo as object),
          lastActive: new Date(),
        },
      });

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
