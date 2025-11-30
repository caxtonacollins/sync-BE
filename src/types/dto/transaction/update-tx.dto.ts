import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateTxDto {
  @IsEnum(['pending', 'completed', 'failed', 'reversed'])
  status: 'pending' | 'completed' | 'failed' | 'reversed';

  @IsOptional()
  @IsString()
  completedAt?: string;
}
