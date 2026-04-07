import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { PrismaService } from '../shared/services/prisma.service';
import { CouponCacheService } from './services/cache.service';

const mockPrisma = {
  coupon: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  },
};

const mockCacheService = {
  getCachedCoupon: jest.fn().mockResolvedValue(null),
  getCachedCoupons: jest.fn().mockResolvedValue(null),
  getCachedCouponByCode: jest.fn().mockResolvedValue(null),
  cacheCoupon: jest.fn().mockResolvedValue(undefined),
  cacheCoupons: jest.fn().mockResolvedValue(undefined),
  cacheCouponByCode: jest.fn().mockResolvedValue(undefined),
  invalidateCoupon: jest.fn().mockResolvedValue(undefined),
  invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
};

describe('CouponService - Soft Delete', () => {
  let service: CouponService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CouponCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<CouponService>(CouponService);
  });

  describe('remove', () => {
    it('should soft delete a coupon by setting isDeleted=true and deletedAt', async () => {
      const couponId = 'coupon-123';
      const existingCoupon = {
        id: couponId,
        code: 'SAVE20',
        isDeleted: false,
        deletedAt: null,
      };

      mockPrisma.coupon.findUnique.mockResolvedValue(existingCoupon);
      mockPrisma.coupon.update.mockResolvedValue({
        ...existingCoupon,
        isDeleted: true,
        deletedAt: new Date(),
      });

      await service.remove(couponId);

      expect(mockPrisma.coupon.update).toHaveBeenCalledWith({
        where: { id: couponId },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.coupon.delete).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should exclude soft-deleted coupons', async () => {
      mockPrisma.coupon.findMany.mockResolvedValue([]);
      mockPrisma.coupon.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 });

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: false },
        }),
      );
    });
  });

  describe('findActive', () => {
    it('should exclude soft-deleted coupons from active list', async () => {
      mockPrisma.coupon.findMany.mockResolvedValue([]);

      await service.findActive();

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
          }),
        }),
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted coupon within 7 days', async () => {
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() - 4);

      const deletedCoupon = {
        id: 'coupon-123',
        code: 'SAVE20',
        isDeleted: true,
        deletedAt,
      };

      mockPrisma.coupon.findUnique.mockResolvedValue(deletedCoupon);
      mockPrisma.coupon.update.mockResolvedValue({
        ...deletedCoupon,
        isDeleted: false,
        deletedAt: null,
      });

      await service.restore('coupon-123');

      expect(mockPrisma.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-123' },
        data: { isDeleted: false, deletedAt: null },
      });
    });

    it('should throw error when coupon was deleted more than 7 days ago', async () => {
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() - 9);

      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: 'coupon-123',
        isDeleted: true,
        deletedAt,
      });

      await expect(service.restore('coupon-123')).rejects.toThrow(
        HttpException,
      );
    });

    it('should throw error when coupon is not deleted', async () => {
      mockPrisma.coupon.findUnique.mockResolvedValue({
        id: 'coupon-123',
        isDeleted: false,
        deletedAt: null,
      });

      await expect(service.restore('coupon-123')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('findDeleted', () => {
    it('should return only soft-deleted coupons', async () => {
      const deleted = [
        { id: 'c1', code: 'OLD', isDeleted: true, deletedAt: new Date() },
      ];
      mockPrisma.coupon.findMany.mockResolvedValue(deleted);
      mockPrisma.coupon.count.mockResolvedValue(1);

      const result = await service.findDeleted({ page: 1, limit: 20 });

      expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: true },
        }),
      );
      expect(result.data).toEqual(deleted);
    });
  });
});
