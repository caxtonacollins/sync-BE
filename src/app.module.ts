import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { TransactionModule } from './transaction/transaction.module';
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module';
import { ContractModule } from './contract/contract.module';
import { MonnifyService } from './monnify/monnify.service';

@Module({
  imports: [
    UserModule,
    PrismaModule,
    AuthModule,
    TransactionModule,
    ExchangeRateModule,
    ContractModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService, MonnifyService],
})
export class AppModule {}
