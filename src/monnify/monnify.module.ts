import { Module } from '@nestjs/common';
import { MonnifyService } from './monnify.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MonnifyController } from './monnify.controller';

@Module({
    providers: [MonnifyService],
    exports: [MonnifyService],
    imports: [PrismaModule],
    controllers: [MonnifyController],
})
export class MonnifyModule { }
