import { ApiProperty } from '@nestjs/swagger';
import { AccountStatus, UserRole, VerificationStatus } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the user',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName: string;

  @ApiProperty({
    description: 'Phone number',
    example: '+2348012345678',
  })
  phoneNumber?: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: 'USER',
  })
  role: UserRole;

  @ApiProperty({
    description: 'Account verification status',
    enum: VerificationStatus,
    example: 'UNVERIFIED',
  })
  verificationStatus: VerificationStatus;

  @ApiProperty({
    description: 'Account status',
    enum: AccountStatus,
    example: 'ACTIVE',
  })
  accountStatus: AccountStatus;

  @ApiProperty({
    description: 'Date and time when the user was created',
    example: '2025-10-16T10:00:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Date and time when the user was last updated',
    example: '2025-10-16T10:00:00Z',
  })
  updatedAt: Date;
}
