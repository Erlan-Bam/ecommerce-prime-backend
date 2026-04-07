import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ProductService } from './product.service';
import { PrismaService } from '../shared/services/prisma.service';
import { ProductCacheService } from './services/cache.service';

const mockPrisma = {
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  category: {
    findMany: jest.fn(),
  },
  brand: {
    findMany: jest.fn(),
  },
  productAttribute: {
    groupBy: jest.fn(),
  },
  productCategory: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  productImage: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
};

const mockCacheService = {
  getCachedProduct: jest.fn().mockResolvedValue(null),
  getCachedProducts: jest.fn().mockResolvedValue(null),
  cacheProduct: jest.fn().mockResolvedValue(undefined),
  cacheProducts: jest.fn().mockResolvedValue(undefined),
  invalidateProduct: jest.fn().mockResolvedValue(undefined),
  invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
};

describe('ProductService - Soft Delete', () => {
  let service: ProductService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProductCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  describe('remove', () => {
    it('should soft delete a product by setting isDeleted=true and deletedAt', async () => {
      const productId = 'prod-123';
      const existingProduct = {
        id: productId,
        name: 'Test Product',
        slug: 'test-product',
        price: 100,
        isDeleted: false,
        deletedAt: null,
        reviews: [],
        productStock: [],
        categories: [],
        brand: null,
        images: [],
        attributes: [],
      };

      mockPrisma.product.findUnique.mockResolvedValue(existingProduct);
      mockPrisma.product.update.mockImplementation(({ where, data }) => {
        if (data.viewCount) return Promise.resolve(existingProduct);
        return Promise.resolve({
          ...existingProduct,
          isDeleted: true,
          deletedAt: new Date(),
        });
      });

      await service.remove(productId);

      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
        },
      });
      expect(mockPrisma.product.delete).not.toHaveBeenCalled();
    });
  });

  describe('findAll - query filtering', () => {
    it('should include isDeleted: false in where clause', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);
      mockPrisma.category.findMany.mockResolvedValue([]);

      await service.findAll({ page: 1, limit: 20 });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
          }),
        }),
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted product within 7 days', async () => {
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() - 2);

      const deletedProduct = {
        id: 'prod-123',
        name: 'Deleted Product',
        isDeleted: true,
        deletedAt,
        reviews: [],
        productStock: [],
      };

      mockPrisma.product.findUnique.mockResolvedValue(deletedProduct);
      mockPrisma.product.update.mockResolvedValue({
        ...deletedProduct,
        isDeleted: false,
        deletedAt: null,
      });

      await service.restore('prod-123');

      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-123' },
        data: { isDeleted: false, deletedAt: null },
      });
    });

    it('should throw error when product was deleted more than 7 days ago', async () => {
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() - 8);

      mockPrisma.product.findUnique.mockResolvedValue({
        id: 'prod-123',
        isDeleted: true,
        deletedAt,
        reviews: [],
        productStock: [],
      });

      await expect(service.restore('prod-123')).rejects.toThrow(HttpException);
    });
  });

  describe('findDeleted', () => {
    it('should return only soft-deleted products', async () => {
      const deleted = [
        {
          id: 'p1',
          isDeleted: true,
          deletedAt: new Date(),
          reviews: [],
          productStock: [],
        },
      ];
      mockPrisma.product.findMany.mockResolvedValue(deleted);
      mockPrisma.product.count.mockResolvedValue(1);

      const result = await service.findDeleted({ page: 1, limit: 20 });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: true },
        }),
      );
      expect(result.data).toEqual(deleted);
    });
  });
});
