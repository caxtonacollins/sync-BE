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
import { SessionService } from './session.service';
import { Prisma } from '@prisma/client';

@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  create(@Body() data: Prisma.SessionCreateInput) {
    return this.sessionService.create(data);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.sessionService.findAll({ where: query });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: Prisma.SessionUpdateInput) {
    return this.sessionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionService.remove(id);
  }
}
