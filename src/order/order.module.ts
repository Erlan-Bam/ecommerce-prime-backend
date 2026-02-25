import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './controllers/order.controller';
import { AdminOrderController } from './controllers/admin.controller';
import { SharedModule } from '../shared/shared.module';
import { OrderCacheService } from './services/cache.service';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [SharedModule, LoyaltyModule],
  providers: [OrderService, OrderCacheService],
  controllers: [OrderController, AdminOrderController],
})
export class OrderModule {}
