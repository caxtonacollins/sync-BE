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
import { LoginDto } from 'src/types/dto/auth';
import {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  verifyAuthenticationResponse,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  AuthenticatorTransportFuture,
  VerifiedRegistrationResponse,
  WebAuthnCredential,
} from '@simplewebauthn/server';
import * as crypto from 'crypto';
import { Response } from 'express';

const rpName = 'Sync';
// Use environment variable or fallback to 'localhost' for development
const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
// Use environment variable or fallback to localhost:3000 for development
const origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';

@Injectable()
export class AuthService {
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30; // minutes
  private readonly refreshCookieName = 'refresh_token';

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private sessionService: SessionService,
    private readonly keyManagementService: KeyManagementService,
  ) {}

  private setRefreshCookie(res: Response, token: string) {
    const isProd = process.env.NODE_ENV === 'production';
    const forceSecure = process.env.FORCE_SECURE_COOKIES === 'true';
    const frontendIsHttps = (process.env.FRONTEND_URL || '').startsWith(
      'https',
    );
    const secure = isProd || forceSecure || frontendIsHttps;
    const sameSiteEnv = process.env.COOKIE_SAMESITE as
      | 'lax'
      | 'none'
      | 'strict'
      | undefined;
    const sameSite = sameSiteEnv || (secure ? 'none' : 'lax');

    res.cookie(this.refreshCookieName, token, {
      httpOnly: true,
      secure: secure,
      sameSite: sameSite,
      path: '/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private clearRefreshCookie(res: Response) {
    const isProd = process.env.NODE_ENV === 'production';
    const forceSecure = process.env.FORCE_SECURE_COOKIES === 'true';
    const frontendIsHttps = (process.env.FRONTEND_URL || '').startsWith(
      'https',
    );
    const secure = isProd || forceSecure || frontendIsHttps;
    const sameSiteEnv = process.env.COOKIE_SAMESITE as
      | 'lax'
      | 'none'
      | 'strict'
      | undefined;
    const sameSite = sameSiteEnv || (secure ? 'none' : 'lax');

    res.clearCookie(this.refreshCookieName, {
      httpOnly: true,
      secure: secure,
      sameSite: sameSite,
      path: '/auth',
    });
  }

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

  async login(
    loginDto: LoginDto,
    ipAddress: string,
    userAgent: string,
    res: Response,
  ) {
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

    this.setRefreshCookie(res, refreshToken);

    return {
      access_token: accessToken,
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
          tokenSymbol: 'ETH',
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
          tokenSymbol: 'ETH',
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
        tokenSymbol: true,
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

    const passkeyAuthenticators =
      await this.prisma.passkeyAuthenticator.findMany({
        where: { userId },
      });

    return {
      mfaEnabled: user.twoFactorEnabled,
      passkeyEnabled: passkeyAuthenticators.length > 0,
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
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password,
    );
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

  async generateRegistrationOptions(userId: string, email: string) {
    // Clean up any existing challenges for this user
    await this.prisma.authChallenge.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { userId }],
      },
    });

    let user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passkeyAuthenticators: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate a new webauthnUserID if it doesn't exist
    if (!user.webauthnUserID) {
      const newWebauthnUserID = crypto.randomUUID();
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { webauthnUserID: newWebauthnUserID },
        include: { passkeyAuthenticators: true },
      });
    }

    if (!user.webauthnUserID) {
      throw new BadRequestException('Could not create a webauthn user ID');
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(user.webauthnUserID),
      userName: user.firstName + ' ' + user.lastName,
      userDisplayName: user.firstName + ' ' + user.lastName,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    });

    await this.prisma.authChallenge.create({
      data: {
        challenge: options.challenge,
        userId: user.id,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 mins
      },
    });

    return options;
  }

  async verifyRegistration(userId: string, body: RegistrationResponseJSON) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passkeyAuthenticators: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Find the challenge for this user
    const challengeRecord = await this.prisma.authChallenge.findFirst({
      where: {
        userId: user.id,
        expiresAt: { gte: new Date() },
      },
    });

    if (!challengeRecord || !challengeRecord.challenge) {
      throw new BadRequestException('Challenge not found or expired');
    }

    let verification: VerifiedRegistrationResponse;

    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
    } catch (error) {
      const err = error as Error;
      throw new BadRequestException(
        err.message || 'Failed to verify registration',
      );
    }

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const { credential, credentialBackedUp } = registrationInfo;
      const {
        id: credentialID,
        publicKey: credentialPublicKey,
        counter,
      } = credential;

      const existingAuthenticator =
        await this.prisma.passkeyAuthenticator.findUnique({
          where: { credentialID },
        });

      if (existingAuthenticator) {
        throw new BadRequestException(
          'This authenticator has already been registered.',
        );
      }

      await this.prisma.passkeyAuthenticator.create({
        data: {
          userId: user.id,
          credentialID: credentialID,
          credentialPublicKey:
            Buffer.from(credentialPublicKey).toString('base64url'),
          counter: counter,
          credentialDeviceType: 'singleDevice', // Adjust as needed
          credentialBackedUp: credentialBackedUp,
          transports: body.response.transports ?? [],
        },
      });

      // await this.prisma.authChallenge.delete({ where: { id: challengeRecord.id } });
    }

    return { verified };
  }

  async generateAuthenticationOptions(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { passkeyAuthenticators: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const options = await generateAuthenticationOptions({
      userVerification: 'required',
      rpID,
      allowCredentials: user.passkeyAuthenticators.map((auth) => ({
        id: auth.credentialID,
        type: 'public-key',
        transports: auth.transports as AuthenticatorTransportFuture[],
      })),
    });

    await this.prisma.authChallenge.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      update: {
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    return { userId: user.id, options };
  }

  async verifyAuthentication(
    body: { userId: string; assertion: AuthenticationResponseJSON },
    res: Response,
    ipAddress: string,
    userAgent: string,
  ) {
    const { userId, assertion } = body;

    const authenticator = await this.prisma.passkeyAuthenticator.findUnique({
      where: { credentialID: assertion.id },
      include: { user: true },
    });

    if (!authenticator) {
      throw new NotFoundException('Authenticator not found');
    }

    const { user } = authenticator;

    // Find the challenge for this user
    const challengeRecord = await this.prisma.authChallenge.findFirst({
      where: {
        userId: user.id,
        expiresAt: { gte: new Date() },
      },
    });

    if (!challengeRecord) {
      throw new BadRequestException('Challenge not found or expired');
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      const credential: WebAuthnCredential = {
        id: authenticator.credentialID,
        publicKey: Buffer.from(authenticator.credentialPublicKey, 'base64url'),
        counter: Number(authenticator.counter),
        transports: authenticator.transports as AuthenticatorTransportFuture[],
      };

      verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential,
        requireUserVerification: true,
      });
    } catch (error) {
      const err = error as Error;
      console.error('Passkey Authentication Verification Error:', err);
      throw new BadRequestException(
        err.message || 'Failed to verify authentication',
      );
    }

    const { verified, authenticationInfo } = verification;

    if (verified) {
      await this.prisma.passkeyAuthenticator.update({
        where: { id: authenticator.id },
        data: { counter: authenticationInfo.newCounter },
      });

      await this.prisma.authChallenge.delete({
        where: { id: challengeRecord.id },
      });

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

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

      this.setRefreshCookie(res, refreshToken);

      return {
        access_token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      };
    }

    throw new UnauthorizedException('Passkey verification failed');
  }

  async refreshToken(refreshToken: string | undefined, res: Response) {
    try {
      if (!refreshToken) {
        throw new UnauthorizedException('Refresh token missing');
      }

      const payload = await this.jwtService.verifyAsync(refreshToken);

      const session = await this.sessionService.findByToken(refreshToken);

      if (!session) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (session.expiresAt < new Date()) {
        await this.sessionService.remove(session.id);
        throw new UnauthorizedException('Refresh token expired');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== AccountStatus.ACTIVE) {
        throw new UnauthorizedException('User not found or inactive');
      }

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

      this.setRefreshCookie(res, newRefreshToken);

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

  async logout(refreshToken: string | undefined, res: Response) {
    this.clearRefreshCookie(res);

    if (!refreshToken) {
      return { message: 'Logged out' };
    }

    const session = await this.sessionService.findByToken(refreshToken);
    if (session) {
      await this.sessionService.remove(session.id);
    }

    return { message: 'Logged out' };
  }

  async disablePasskey(userId: string) {
    await this.prisma.passkeyAuthenticator.deleteMany({
      where: { userId },
    });
    return { message: 'Passkey disabled successfully' };
  }
}
