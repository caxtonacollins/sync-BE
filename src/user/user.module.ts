import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MonnifyService } from '../monnify/monnify.service';

@Module({
  controllers: [UserController],
  providers: [UserService, MonnifyService],
  imports: [PrismaModule],
})
export class UserModule {}
