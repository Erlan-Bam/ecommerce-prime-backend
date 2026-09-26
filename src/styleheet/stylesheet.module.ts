import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { StyleSheetController } from './stylesheet.controller';
import { StyleSheetService } from './stylesheet.service';

@Module({
  imports: [SharedModule],
  controllers: [StyleSheetController],
  providers: [StyleSheetService],
  exports: [StyleSheetService],
})
export class StyleSheetModule {}
