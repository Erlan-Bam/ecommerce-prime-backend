import { Test, TestingModule } from '@nestjs/testing';
import { validateSync } from 'class-validator';
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../shared/services/prisma.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { OrderService } from './order.service';
import { OrderCacheService } from './services/cache.service';
import { AdminFinalizeOrderDto, FinalizeOrderDto } from './dto';
import { AmoCrmService } from '../amocrm';

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: OrderCacheService,
          useValue: {},
        },
        {
          provide: LoyaltyService,
          useValue: {},
        },
        {
          provide: AmoCrmService,
          useValue: {
            safeSubmitOrder: jest.fn(),
            safeSubmitOrderCancellation: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('allows cash payments for customer and admin checkout finalization', () => {
    const customerDto = Object.assign(new FinalizeOrderDto(), {
      deliveryMethod: DeliveryMethod.DELIVERY,
      buyer: 'Иван Иванов',
      email: 'customer@example.com',
      phone: '+7 999 123 45 67',
      address: 'г. Москва, улица Барклая, 6Ак1',
      paymentMethod: PaymentMethod.CASH,
    });

    const adminDto = Object.assign(new AdminFinalizeOrderDto(), {
      deliveryMethod: DeliveryMethod.DELIVERY,
      address: 'г. Москва, улица Барклая, 6Ак1',
      paymentMethod: PaymentMethod.CASH,
    });

    expect(validateSync(customerDto)).toEqual([]);
    expect(validateSync(adminDto)).toEqual([]);
  });

  it('submits admin-finalized quick buy orders to amoCRM', async () => {
    const pendingOrder = {
      id: 107,
      status: OrderStatus.PENDING,
      total: { toNumber: () => 100000 },
      discount: { toNumber: () => 0 },
      items: [],
    };
    const updatedOrder = {
      ...pendingOrder,
      status: OrderStatus.PROCESSING,
      deliveryMethod: DeliveryMethod.DELIVERY,
      paymentMethod: PaymentMethod.CASH,
      finalTotal: 100990,
      buyer: 'Тестовый клиент',
      email: 'client@example.com',
      phone: '+7 999 000-00-00',
      address: 'Москва',
      userId: null,
      items: [
        {
          quantity: 1,
          price: 100000,
          product: { id: 'product-1', name: 'iPhone', slug: 'iphone' },
        },
      ],
    };
    const prisma = {
      $transaction: jest.fn(async (callback) =>
        callback({
          order: {
            findUnique: jest.fn().mockResolvedValue(pendingOrder),
            update: jest.fn().mockResolvedValue(updatedOrder),
          },
        }),
      ),
    };
    const cacheService = {
      invalidateUserOrders: jest.fn(),
      invalidateOrder: jest.fn(),
    };
    const amoCrmService = {
      safeSubmitOrder: jest.fn(),
    };
    const service = new OrderService(
      prisma as any,
      cacheService as any,
      {} as any,
      amoCrmService as any,
    );

    await service.adminFinalizeOrder(107, {
      deliveryMethod: DeliveryMethod.DELIVERY,
      paymentMethod: PaymentMethod.CASH,
      address: 'Москва',
      buyer: 'Тестовый клиент',
      email: 'client@example.com',
      phone: '+7 999 000-00-00',
      deliveryCost: 990,
    });

    expect(amoCrmService.safeSubmitOrder).toHaveBeenCalledWith(updatedOrder, [
      'admin-finalized',
    ]);
  });

  it('manually resyncs an existing order to amoCRM', async () => {
    const order = {
      id: 107,
      status: OrderStatus.PROCESSING,
      userId: null,
      items: [],
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
      },
    };
    const amoCrmService = {
      safeSubmitOrder: jest.fn(),
      safeSubmitOrderCancellation: jest.fn(),
    };
    const service = new OrderService(
      prisma as any,
      {} as any,
      {} as any,
      amoCrmService as any,
    );

    await expect(service.syncOrderToAmoCrm(107)).resolves.toEqual({
      id: 107,
      status: OrderStatus.PROCESSING,
      synced: true,
    });
    expect(amoCrmService.safeSubmitOrder).toHaveBeenCalledWith(order, [
      'admin-resync',
    ]);
    expect(amoCrmService.safeSubmitOrderCancellation).not.toHaveBeenCalled();
  });

  it('manually resyncs an existing cancelled order as an amoCRM cancellation', async () => {
    const order = {
      id: 107,
      status: OrderStatus.CANCELLED,
      userId: null,
      items: [],
    };
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
      },
    };
    const amoCrmService = {
      safeSubmitOrder: jest.fn(),
      safeSubmitOrderCancellation: jest.fn(),
    };
    const service = new OrderService(
      prisma as any,
      {} as any,
      {} as any,
      amoCrmService as any,
    );

    await expect(service.syncOrderToAmoCrm(107)).resolves.toEqual({
      id: 107,
      status: OrderStatus.CANCELLED,
      synced: true,
    });
    expect(amoCrmService.safeSubmitOrderCancellation).toHaveBeenCalledWith(
      order,
      'admin-resync',
    );
    expect(amoCrmService.safeSubmitOrder).not.toHaveBeenCalled();
  });
});
