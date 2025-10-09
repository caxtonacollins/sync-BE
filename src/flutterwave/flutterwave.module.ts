import { Module } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { FlutterwaveController } from './flutterwave.controller';

@Module({
  providers: [FlutterwaveService],
  exports: [FlutterwaveService],
  imports: [PrismaModule],
  controllers: [FlutterwaveController],
})
export class FlutterwaveModule {}
