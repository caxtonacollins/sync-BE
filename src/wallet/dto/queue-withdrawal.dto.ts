import { IsString, IsNumber, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class QueueWithdrawalDto {
  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  bankAccountId?: string; // Optional: if user wants to use a specific bank account

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>; // Additional metadata like bank details if needed

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsIn(['BANK_TRANSFER', 'CRYPTO', 'OTHER'])
  withdrawalMethod: 'BANK_TRANSFER' | 'CRYPTO' | 'OTHER';

  @IsString()
  @IsOptional()
  destinationAddress?: string; // For crypto withdrawals
}

// This is a helper decorator for object validation
function IsObject() {
  return function (object: any, propertyName: string) {
    // This is a simplified version - in a real app, you'd want more robust validation
    // that checks if the value is a plain object
    const validate = (value: any) => {
      return value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value));
    };
    
    // Register the validation
    const originalMethod = object[propertyName];
    object[propertyName] = function(...args: any[]) {
      const value = args[0];
      if (!validate(value)) {
        throw new Error(`${propertyName} must be an object`);
      }
      return originalMethod.apply(this, args);
    };
  };
}
