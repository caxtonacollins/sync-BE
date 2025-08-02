import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MonnifyService } from '../monnify/monnify.service';
import { ContractService } from 'src/contract/contract.service';

@Module({
  controllers: [UserController],
  providers: [UserService, MonnifyService, ContractService],
  imports: [PrismaModule],
})
export class UserModule {}
