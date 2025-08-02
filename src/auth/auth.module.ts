import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { KeyManagementService } from './key-management.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SessionModule } from '../session/session.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    SessionModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRATION_TIME', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, KeyManagementService],
  exports: [AuthService, KeyManagementService],
})
export class AuthModule {}
