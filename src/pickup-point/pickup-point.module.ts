import { Module } from '@nestjs/common';
import { PickupPointController } from './pickup-point.controller';
import { PickupWindowController } from './pickup-window.controller';
import { PickupPointService } from './services/pickup-point.service';
import { PickupWindowService } from './services/pickup-window.service';
import { PickupPointCacheService } from './services/cache.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [PickupPointController, PickupWindowController],
  providers: [PickupPointService, PickupWindowService, PickupPointCacheService],
  exports: [PickupPointService, PickupWindowService],
})
export class PickupPointModule {}
