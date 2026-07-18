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
    const amoCrmService = {
      safeSubmitOrderCancellation: jest.fn(),
    };
    const service = new OrderService(
      prisma as any,
      cacheService as any,
      loyaltyService as any,
      amoCrmService as any,
    );

    await expect(
      service.updateOrderStatus(1, { status: OrderStatus.CANCELLED }),
    ).rejects.toThrow('Order can only be cancelled before confirmation');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects user cancellation after the order has been confirmed', async () => {
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          userId: 'user-1',
          status: OrderStatus.CONFIRMED,
        }),
      },
      $transaction: jest.fn(),
    };
    const cacheService = {
      invalidateUserOrders: jest.fn(),
      invalidateOrder: jest.fn(),
    };
    const amoCrmService = {
      safeSubmitOrderCancellation: jest.fn(),
    };
    const service = new OrderService(
      prisma as any,
      cacheService as any,
      {} as any,
      amoCrmService as any,
    );

    await expect(service.cancelOrder('user-1', 1)).rejects.toThrow(
      'Order can only be cancelled before confirmation',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets users cancel an order before it has been confirmed', async () => {
    const updatedOrder = {
      id: 1,
      userId: 'user-1',
      status: OrderStatus.CANCELLED,
    };
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          userId: 'user-1',
          status: OrderStatus.PROCESSING,
        }),
        update: jest.fn().mockResolvedValue(updatedOrder),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    const cacheService = {
      invalidateUserOrders: jest.fn(),
      invalidateOrder: jest.fn(),
    };
    const amoCrmService = {
      safeSubmitOrderCancellation: jest.fn(),
    };
    const service = new OrderService(
      prisma as any,
      cacheService as any,
      {} as any,
      amoCrmService as any,
    );

    await expect(service.cancelOrder('user-1', 1)).resolves.toBe(updatedOrder);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { status: OrderStatus.CANCELLED },
      }),
    );
    expect(cacheService.invalidateUserOrders).toHaveBeenCalledWith('user-1');
    expect(cacheService.invalidateOrder).toHaveBeenCalledWith('user-1', 1);
    expect(amoCrmService.safeSubmitOrderCancellation).toHaveBeenCalledWith(
      updatedOrder,
      'user-cancel',
    );
  });
});
