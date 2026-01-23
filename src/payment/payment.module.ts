import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './controllers/payment.controller';
import { AdminPaymentController } from './controllers/admin.controller';
import { SharedModule } from '../shared/shared.module';
import { PaymentCacheService } from './services/cache.service';
import { OrderCacheService } from '../order/services/cache.service';

@Module({
  imports: [SharedModule],
  providers: [PaymentService, PaymentCacheService, OrderCacheService],
  controllers: [PaymentController, AdminPaymentController],
  exports: [PaymentService, PaymentCacheService],
})
export class PaymentModule {}
