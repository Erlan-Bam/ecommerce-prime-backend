import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  providers: [OrderService],
  controllers: [OrderController],
})
export class OrderModule {}
