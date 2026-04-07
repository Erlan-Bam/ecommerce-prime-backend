import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CategoryService } from './category.service';
import { PrismaService } from '../../shared/services/prisma.service';
import { CategoryCacheService } from './cache.service';

const mockPrisma = {
  category: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  },
  productCategory: {
    count: jest.fn(),
  },
};

const mockCacheService = {
  getCachedCategory: jest.fn().mockResolvedValue(null),
  getCachedCategories: jest.fn().mockResolvedValue(null),
  cacheCategory: jest.fn().mockResolvedValue(undefined),
  cacheCategories: jest.fn().mockResolvedValue(undefined),
  invalidateCategory: jest.fn().mockResolvedValue(undefined),
  invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
};

describe('CategoryService - Soft Delete', () => {
  let service: CategoryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CategoryCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  describe('remove', () => {
    it('should soft delete a category by setting isDeleted=true and deletedAt', async () => {
      const categoryId = 'cat-123';
      const existingCategory = {
        id: categoryId,
        title: 'Test',
        slug: 'test',
        isActive: true,
        isDeleted: false,
        deletedAt: null,
      };

      mockPrisma.category.findUnique.mockResolvedValue(existingCategory);
      mockPrisma.productCategory.count.mockResolvedValue(0);
      mockPrisma.category.count.mockResolvedValue(0);
      mockPrisma.category.update.mockResolvedValue({
        ...existingCategory,
        isDeleted: true,
        deletedAt: expect.any(Date),
      });

      const result = await service.remove(categoryId);

      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: categoryId },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
        },
      });
      // Should NOT call delete
      expect(mockPrisma.category.delete).not.toHaveBeenCalled();
      expect(mockCacheService.invalidateAllCaches).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND if category does not exist', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('findAll', () => {
    it('should exclude soft-deleted categories from results', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.category.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10 });

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            isDeleted: false,
          }),
        }),
      );
    });
  });

  describe('findTree', () => {
    it('should exclude soft-deleted categories from tree', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);

      await service.findTree();

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
          }),
        }),
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted category within 7 days', async () => {
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() - 3); // 3 days ago

      const deletedCategory = {
        id: 'cat-123',
        title: 'Deleted Cat',
        isDeleted: true,
        deletedAt,
      };

      mockPrisma.category.findUnique.mockResolvedValue(deletedCategory);
      mockPrisma.category.update.mockResolvedValue({
        ...deletedCategory,
        isDeleted: false,
        deletedAt: null,
      });

      const result = await service.restore('cat-123');

      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-123' },
        data: {
          isDeleted: false,
          deletedAt: null,
        },
      });
    });

    it('should throw error when restoring a category deleted more than 7 days ago', async () => {
      const deletedAt = new Date();
      deletedAt.setDate(deletedAt.getDate() - 10); // 10 days ago

      const deletedCategory = {
        id: 'cat-123',
        title: 'Old Deleted',
        isDeleted: true,
        deletedAt,
      };

      mockPrisma.category.findUnique.mockResolvedValue(deletedCategory);

      await expect(service.restore('cat-123')).rejects.toThrow(HttpException);
    });

    it('should throw error when restoring a non-deleted category', async () => {
      const category = {
        id: 'cat-123',
        title: 'Active',
        isDeleted: false,
        deletedAt: null,
      };

      mockPrisma.category.findUnique.mockResolvedValue(category);

      await expect(service.restore('cat-123')).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND for nonexistent category', async () => {
      mockPrisma.category.findUnique.mockResolvedValue(null);

      await expect(service.restore('nonexistent')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('findDeleted', () => {
    it('should return only soft-deleted categories with pagination', async () => {
      const deletedCategories = [
        { id: 'cat-1', isDeleted: true, deletedAt: new Date() },
      ];

      mockPrisma.category.findMany.mockResolvedValue(deletedCategories);
      mockPrisma.category.count.mockResolvedValue(1);

      const result = await service.findDeleted({ page: 1, limit: 10 });

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDeleted: true },
        }),
      );
      expect(result.data).toEqual(deletedCategories);
      expect(result.meta.total).toBe(1);
    });
  });
});
