import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { SystemSettingService } from './system-setting.service';
import { Prisma } from '@prisma/client';

@Controller('system-setting')
export class SystemSettingController {
  constructor(private readonly systemSettingService: SystemSettingService) {}

  @Post()
  create(@Body() data: Prisma.SystemSettingCreateInput) {
    return this.systemSettingService.create(data);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.systemSettingService.findAll({ where: query });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.systemSettingService.findOne(id);
  }

  @Get('key/:key')
  findByKey(@Param('key') key: string) {
    return this.systemSettingService.findByKey(key);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() data: Prisma.SystemSettingUpdateInput,
  ) {
    return this.systemSettingService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.systemSettingService.remove(id);
  }
}
