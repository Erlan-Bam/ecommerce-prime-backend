import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './controllers/order.controller';
import { AdminOrderController } from './controllers/admin.controller';
import { SharedModule } from '../shared/shared.module';
import { OrderCacheService } from './services/cache.service';

@Module({
  imports: [SharedModule],
  providers: [OrderService, OrderCacheService],
  controllers: [OrderController, AdminOrderController],
})
export class OrderModule {}
