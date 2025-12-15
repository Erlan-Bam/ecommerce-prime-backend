import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { SharedModule } from '../shared/shared.module';
import { OrderCacheService } from './services/cache.service';

@Module({
  imports: [SharedModule],
  providers: [OrderService, OrderCacheService],
  controllers: [OrderController],
})
export class OrderModule {}
