import { OrderStatus } from '@prisma/client';
import { OrderService } from './order.service';

describe('OrderService cancellation rules', () => {
  it('rejects cancellation after the order has been confirmed', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: OrderStatus.CONFIRMED,
          userId: null,
        }),
      },
      $transaction: jest.fn(),
    };
    const cacheService = {
      invalidateUserOrders: jest.fn(),
      invalidateOrder: jest.fn(),
    };
    const loyaltyService = {
      scheduleCashbackAccrual: jest.fn(),
    };
    const service = new OrderService(
      prisma as any,
      cacheService as any,
      loyaltyService as any,
    );

    await expect(
      service.updateOrderStatus(1, { status: OrderStatus.CANCELLED }),
    ).rejects.toThrow('Order can only be cancelled before confirmation');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
