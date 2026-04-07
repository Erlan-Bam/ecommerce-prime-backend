import { Test, TestingModule } from '@nestjs/testing';
import { CronService } from './cron.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

const mockPrisma = {
  category: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  brand: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  product: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  coupon: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  pickupPoint: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  blog: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
};

const mockRedisService = {
  set: jest.fn().mockResolvedValue(undefined),
  clearByPattern: jest.fn().mockResolvedValue(undefined),
};

describe('CronService - Soft Delete Cleanup', () => {
  let service: CronService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<CronService>(CronService);
  });

  describe('cleanupSoftDeletedItems', () => {
    it('should hard delete items that were soft-deleted more than 7 days ago', async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      mockPrisma.product.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.category.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.brand.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.coupon.deleteMany.mockResolvedValue({ count: 0 });

      await service.cleanupSoftDeletedItems();

      // Should call deleteMany on all 4 models with isDeleted=true and deletedAt < 7 days ago
      expect(mockPrisma.product.deleteMany).toHaveBeenCalledWith({
        where: {
          isDeleted: true,
          deletedAt: { lte: expect.any(Date) },
        },
      });
      expect(mockPrisma.category.deleteMany).toHaveBeenCalledWith({
        where: {
          isDeleted: true,
          deletedAt: { lte: expect.any(Date) },
        },
      });
      expect(mockPrisma.brand.deleteMany).toHaveBeenCalledWith({
        where: {
          isDeleted: true,
          deletedAt: { lte: expect.any(Date) },
        },
      });
      expect(mockPrisma.coupon.deleteMany).toHaveBeenCalledWith({
        where: {
          isDeleted: true,
          deletedAt: { lte: expect.any(Date) },
        },
      });
    });

    it('should verify the cutoff date is approximately 7 days ago', async () => {
      mockPrisma.product.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.category.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.brand.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.coupon.deleteMany.mockResolvedValue({ count: 0 });

      await service.cleanupSoftDeletedItems();

      const call = mockPrisma.product.deleteMany.mock.calls[0][0];
      const cutoffDate = call.where.deletedAt.lte as Date;
      const now = new Date();
      const diffDays =
        (now.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24);

      // Cutoff should be ~7 days ago (allow small tolerance)
      expect(diffDays).toBeGreaterThanOrEqual(6.9);
      expect(diffDays).toBeLessThanOrEqual(7.1);
    });
  });
});
