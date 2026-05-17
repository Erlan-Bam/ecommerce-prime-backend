import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService', () => {
  let service: LoyaltyService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
    };

    service = new LoyaltyService(prisma);
  });

  describe('scheduleCashbackAccrual', () => {
    it('schedules cashback for 7 days after delivery without creating a bonus balance record', async () => {
      const deliveredAt = new Date('2026-05-17T10:00:00.000Z');
      const tx = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ totalSpent: 0 }),
        },
        order: {
          update: jest.fn().mockResolvedValue({}),
        },
        bonus: {
          create: jest.fn(),
        },
      };

      const result = await service.scheduleCashbackAccrual(
        tx,
        'user-1',
        123,
        10000,
        deliveredAt,
      );

      expect(result).toEqual({
        cashbackAmount: 100,
        availableAt: new Date('2026-05-24T10:00:00.000Z'),
      });
      expect(tx.bonus.create).not.toHaveBeenCalled();
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          bonusEarned: 100,
          bonusAccrualScheduledAt: deliveredAt,
          bonusAccrualAvailableAt: new Date('2026-05-24T10:00:00.000Z'),
          bonusAccruedAt: null,
        },
      });
    });
  });

  describe('accrueScheduledCashback', () => {
    it('creates the bonus transaction and marks the order as accrued when the pending cashback is due', async () => {
      const now = new Date('2026-05-24T11:00:00.000Z');
      const tx = {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 123,
            userId: 'user-1',
            finalTotal: 10000,
            bonusEarned: 100,
            bonusAccrualAvailableAt: new Date('2026-05-24T10:00:00.000Z'),
            bonusAccruedAt: null,
            status: 'DELIVERED',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        bonus: {
          create: jest.fn().mockResolvedValue({}),
        },
        user: {
          update: jest.fn().mockResolvedValue({}),
        },
      };
      prisma.$transaction.mockImplementation((callback: any) => callback(tx));

      await service.accrueScheduledCashback(123, now);

      expect(tx.bonus.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          orderId: 123,
          amount: 100,
          type: 'INCREASE',
          description: 'Кешбэк за заказ #123',
        },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: { bonusAccruedAt: now },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          totalSpent: { increment: 10000 },
        },
      });
    });
  });
});
