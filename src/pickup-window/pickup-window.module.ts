import { Module } from '@nestjs/common';
import { PickupWindowController } from './pickup-window.controller';
import { PickupWindowService } from './services/pickup-window.service';
import { PickupWindowCacheService } from './services/cache.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [PickupWindowController],
  providers: [PickupWindowService, PickupWindowCacheService],
  exports: [PickupWindowService],
})
export class PickupWindowModule {}
