import { VerificationStatus, AccountStatus, UserRole } from '@prisma/client';

export interface VirtualAccountUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  bvn?: string | null;
  nin?: string | null;
}

export interface RegistrationStatus {
  isRegistered: boolean;
  accountAddress: string;
}

export interface JwtUser {
  userId: string;
  email: string;
  role: UserRole;
}

export interface RequestWithUser extends Request {
  user: JwtUser;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  status: AccountStatus;
  role: UserRole;
  emailVerified: boolean;
  phoneVerified: boolean;
  kycStatus: VerificationStatus;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserFilterOptions {
  search?: string;
  status?: AccountStatus;
  role?: UserRole;
  kycStatus?: VerificationStatus;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedUserResponse {
  data: UserProfile[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
