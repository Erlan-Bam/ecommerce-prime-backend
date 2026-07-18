import { AuthService } from './auth.service';

const decimal = (value: number) => ({
  toNumber: () => value,
});

describe('AuthService', () => {
  const createService = (prisma: any, redisService: any) =>
    new AuthService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      redisService,
    );

  it('merges guest cart items into existing user cart items', async () => {
    const tx = {
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'guest-session-id' }),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'guest-item-id',
            productId: 'product-id',
            quantity: 2,
            product: { price: decimal(100) },
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'user-item-id',
          quantity: 1,
          product: { price: decimal(100) },
        }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const redisService = {
      remove: jest.fn().mockResolvedValue(1),
    };

    const service = createService(prisma, redisService);

    await expect(
      service.mergeGuestCartToUser('user-id', 'guest-session-id'),
    ).resolves.toEqual({ merged: 1 });

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'user-item-id' },
      data: {
        quantity: 3,
        price: 300,
      },
    });
    expect(tx.orderItem.delete).toHaveBeenCalledWith({
      where: { id: 'guest-item-id' },
    });
    expect(redisService.remove).toHaveBeenCalledWith('cart:user-id');
    expect(redisService.remove).toHaveBeenCalledWith(
      'guest:cart:guest-session-id',
    );
  });

  it('moves guest cart items when user cart does not have the product yet', async () => {
    const tx = {
      guestSession: {
        findUnique: jest.fn().mockResolvedValue({ id: 'guest-session-id' }),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'guest-item-id',
            productId: 'product-id',
            quantity: 2,
            product: { price: decimal(100) },
          },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const redisService = {
      remove: jest.fn().mockResolvedValue(1),
    };

    const service = createService(prisma, redisService);

    await expect(
      service.mergeGuestCartToUser('user-id', 'guest-session-id'),
    ).resolves.toEqual({ merged: 1 });

    expect(tx.orderItem.update).toHaveBeenCalledWith({
      where: { id: 'guest-item-id' },
      data: {
        userId: 'user-id',
        sessionId: null,
        price: 200,
      },
    });
    expect(tx.orderItem.delete).not.toHaveBeenCalled();
  });
});
