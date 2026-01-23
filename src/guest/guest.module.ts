import { Module } from '@nestjs/common';
import { GuestCartController } from './guest-cart.controller';
import { GuestOrderController } from './guest-order.controller';
import { GuestCartService, GuestCacheService, GuestOrderService } from './services';

@Module({
  controllers: [GuestCartController, GuestOrderController],
  providers: [GuestCartService, GuestOrderService, GuestCacheService],
  exports: [GuestCartService, GuestOrderService],
})
export class GuestModule {}

