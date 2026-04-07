import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { BrandService } from './brand.service';
import { PrismaService } from '../shared/services/prisma.service';
import { BrandCacheService } from './services/cache.service';

const mockPrisma = {
  brand: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  },
  product: {
    count: jest.fn(),
  },
};

const mockCacheService = {
  getCachedBrand: jest.fn().mockResolvedValue(null),
  getCachedBrands: jest.fn().mockResolvedValue(null),
  cacheBrand: jest.fn().mockResolvedValue(undefined),
  cacheBrands: jest.fn().mockResolvedValue(undefined),
  invalidateBrand: jest.fn().mockResolvedValue(undefined),
  invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
};

describe('BrandService - Soft Delete', () => {
  let service: BrandService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BrandCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<BrandService>(BrandService);
  });

  describe('remove', () => {
    it('should soft delete a brand by setting isDeleted=true and deletedAt', async () => {
      const brandId = 'brand-123';
      const existingBrand = {
        id: brandId,
        name: 'Test Brand',
        slug: 'test-brand',
        isDeleted: false,
        deletedAt: null,
        _count: { products: 0 },
      };

      mockPrisma.brand.findUnique.mockResolvedValue(existingBrand);
      mockPrisma.brand.update.mockResolvedValue({
        ...existingBrand,
        isDeleted: true,
        deletedAt: expect.any(Date),
      });

      await service.remove(brandId);

      expect(mockPrisma.brand.update).toHaveBeenCalledWith({
        where: { id: brandId },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.brand.delete).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should exclude soft-deleted brands', async () => {
      mockPrisma.brand.findMany.mockResolvedValue([]);
      mockPrisma.brand.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 });

      expect(mockPrisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: false },
        }),
      );
      expect(mockPrisma.brand.count).toHaveBeenCalledWith({
        where: { isDeleted: false },
      });
    });
  });

  describe('findActive', () => {
    it('should exclude soft-deleted brands from active list', async () => {
      mockPrisma.brand.findMany.mockResolvedValue([]);

      await service.findActive();

      expect(mockPrisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            isDeleted: false,
          }),
        }),
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted brand within 7 days', async () => {
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() - 5);

      const deletedBrand = {
        id: 'brand-123',
        name: 'Deleted Brand',
        isDeleted: true,
        deletedAt,
      };

      mockPrisma.brand.findUnique.mockResolvedValue(deletedBrand);
      mockPrisma.brand.update.mockResolvedValue({
        ...deletedBrand,
        isDeleted: false,
        deletedAt: null,
      });

      await service.restore('brand-123');

      expect(mockPrisma.brand.update).toHaveBeenCalledWith({
        where: { id: 'brand-123' },
        data: { isDeleted: false, deletedAt: null },
      });
    });

    it('should throw error when brand was deleted more than 7 days ago', async () => {
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() - 10);

      mockPrisma.brand.findUnique.mockResolvedValue({
        id: 'brand-123',
        isDeleted: true,
        deletedAt,
      });

      await expect(service.restore('brand-123')).rejects.toThrow(HttpException);
    });

    it('should throw error when brand is not deleted', async () => {
      mockPrisma.brand.findUnique.mockResolvedValue({
        id: 'brand-123',
        isDeleted: false,
        deletedAt: null,
      });

      await expect(service.restore('brand-123')).rejects.toThrow(HttpException);
    });
  });

  describe('findDeleted', () => {
    it('should return only soft-deleted brands', async () => {
      const deleted = [{ id: 'b1', isDeleted: true, deletedAt: new Date() }];
      mockPrisma.brand.findMany.mockResolvedValue(deleted);
      mockPrisma.brand.count.mockResolvedValue(1);

      const result = await service.findDeleted({ page: 1, limit: 20 });

      expect(mockPrisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: true },
        }),
      );
      expect(result.data).toEqual(deleted);
    });
  });
});
