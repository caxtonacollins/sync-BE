import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ContractModule } from '../contract/contract.module';
import { FlutterwaveModule } from '../flutterwave/flutterwave.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    PrismaModule, 
    forwardRef(() => ContractModule), 
    FlutterwaveModule,
    SharedModule
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
