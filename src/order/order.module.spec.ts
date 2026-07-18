import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { OrderModule } from './order.module';
import { OrderService } from './order.service';
import { AmoCrmService } from '../amocrm';

describe('OrderModule', () => {
  it('wires amoCRM into OrderService so order sync hooks are active', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
              SMSRU_API_ID: 'test-sms-api-id',
            }),
          ],
        }),
        OrderModule,
      ],
    }).compile();

    const orderService = module.get(OrderService);
    const amoCrmService = module.get(AmoCrmService, { strict: false });

    expect((orderService as any).amoCrmService).toBe(amoCrmService);
  });
});
