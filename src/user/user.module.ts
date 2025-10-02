import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MonnifyService } from '../monnify/monnify.service';
import { ContractModule } from '../contract/contract.module';

@Module({
  imports: [PrismaModule, ContractModule],
  controllers: [UserController],
  providers: [UserService, MonnifyService],
  exports: [UserService],
})
export class UserModule {}
