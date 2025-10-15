import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
  Length,
} from 'class-validator';
import { AccountStatus, UserRole, VerificationStatus } from '@prisma/client';
import {
  NIGERIAN_PHONE_REGEX,
  BVN_REGEX,
  NIN_REGEX,
  PASSWORD_VALIDATORS,
  NAME_REGEX,
} from '../../shared/validators';

export class CreateUserDto {
  @IsEmail()
  @MinLength(5)
  @MaxLength(100)
  email: string;

  @IsString()
  @MinLength(PASSWORD_VALIDATORS.MIN_LENGTH)
  @Matches(PASSWORD_VALIDATORS.UPPERCASE, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(PASSWORD_VALIDATORS.LOWERCASE, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(PASSWORD_VALIDATORS.NUMBER, {
    message: 'Password must contain at least one number',
  })
  @Matches(PASSWORD_VALIDATORS.SPECIAL, {
    message: 'Password must contain at least one special character',
  })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(NAME_REGEX, {
    message: 'First name can only contain letters and spaces',
  })
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(NAME_REGEX, {
    message: 'Last name can only contain letters and spaces',
  })
  lastName: string;

  @IsOptional()
  @IsString()
  @Matches(NIGERIAN_PHONE_REGEX, {
    message:
      'Phone number must be in Nigerian format (e.g., +2348012345678 or 08012345678)',
  })
  phoneNumber?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @IsOptional()
  @IsEnum(VerificationStatus)
  verificationStatus?: VerificationStatus;

  @IsString()
  @Length(11, 11)
  @Matches(BVN_REGEX, {
    message: 'BVN must be 11 digits and start with valid prefixes (22-39)',
  })
  bvn: string;

  @IsString()
  @Length(11, 11)
  @Matches(NIN_REGEX, {
    message: 'NIN must be 11 digits and start with 1-9',
  })
  nin: string;
}
