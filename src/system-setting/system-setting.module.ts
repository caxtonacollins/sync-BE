import { Module } from '@nestjs/common';
import { SystemSettingService } from './system-setting.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemSettingController } from './system-setting.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SystemSettingController],
  providers: [SystemSettingService],
  exports: [SystemSettingService],
})
export class SystemSettingModule {}
