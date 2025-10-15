import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ContractModule } from '../contract/contract.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';

@Module({
  imports: [
    PrismaModule, 
    forwardRef(() => ContractModule), 
    FlutterwaveModule
  ],
  controllers: [UserController],
  providers: [UserService, FlutterwaveService],
  exports: [UserService],
})
export class UserModule {}
