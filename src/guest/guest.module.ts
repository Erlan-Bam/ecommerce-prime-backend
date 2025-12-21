import { Module } from '@nestjs/common';
import { GuestCartController } from './guest-cart.controller';
import { GuestCartService, GuestCacheService } from './services';

@Module({
  controllers: [GuestCartController],
  providers: [GuestCartService, GuestCacheService],
  exports: [GuestCartService],
})
export class GuestModule {}
