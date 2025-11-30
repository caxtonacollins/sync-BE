import { AccountStatus } from '@prisma/client';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: string;
  is2FAuthenticated?: boolean;
}

export interface JwtTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface TwoFactorSetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCode: string;
}

export interface UserSession {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithSensitiveInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  status: AccountStatus;
  twoFactorEnabled: boolean;
  loginAttempts: number;
  lockedUntil: Date | null;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
