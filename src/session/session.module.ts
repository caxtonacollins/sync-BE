import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionController } from './session.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
