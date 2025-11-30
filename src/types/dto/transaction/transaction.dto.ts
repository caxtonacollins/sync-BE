import { ApiProperty } from '@nestjs/swagger';

export class TransactionQueryDto {
  @ApiProperty({ required: false })
  userId?: string;

  @ApiProperty({ required: false })
  status?: string;

  @ApiProperty({ required: false })
  type?: string;

  @ApiProperty({ required: false })
  currency?: string;

  @ApiProperty({ required: false, default: 1 })
  page?: number;

  @ApiProperty({ required: false, default: 10 })
  limit?: number;
}

export class TransactionUpdateDto {
  @ApiProperty({ required: true })
  status: string;

  @ApiProperty({ required: false })
  metadata?: Record<string, any>;
}
