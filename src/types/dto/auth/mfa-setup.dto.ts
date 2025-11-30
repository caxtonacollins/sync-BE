import { IsString, Length } from 'class-validator';

export class MfaInitializeDto {
  // No fields needed for initialization
}

export class MfaVerifyDto {
  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  secret: string;
}
