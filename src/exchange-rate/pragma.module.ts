import { Module } from '@nestjs/common';
import { PragmaService } from './pragma.service';

@Module({
  providers: [PragmaService],
  exports: [PragmaService],
})
export class PragmaModule {}
