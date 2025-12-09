import { Module } from '@nestjs/common';
import { PickupPointController } from './pickup-point.controller';
import { PickupPointService } from './services/pickup-point.service';
import { PickupPointCacheService } from './services/cache.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [PickupPointController],
  providers: [PickupPointService, PickupPointCacheService],
  exports: [PickupPointService],
})
export class PickupPointModule {}
