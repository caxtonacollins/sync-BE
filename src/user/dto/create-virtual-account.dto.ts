import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, IsOptional } from 'class-validator';
import { BVN_REGEX, NIN_REGEX } from '../../shared/validators';

export class CreateVirtualAccountDto {
  @ApiProperty({
    description: 'Bank Verification Number (11 digits)',
    example: '12345678901',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(11, 11)
  bvn?: string;

  @ApiProperty({
    description: 'National Identity Number (11 digits)',
    example: '12345678901',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Length(11, 11)
  nin?: string;
}

export class CreateVirtualAccountResponseDto {
  @ApiProperty({
    description: 'Indicates if the virtual account was created successfully',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Message describing the result of the operation',
    example: 'Virtual account created successfully',
  })
  message: string;

  @ApiProperty({
    description: 'The created fiat account details',
    type: Object,
    required: false,
  })
  account?: Record<string, any>;
}
