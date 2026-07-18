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
  $transaction: jest.fn(),
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

    it('should include inactive categories when requested', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.category.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, includeInactive: true });

      expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDeleted: false,
          },
        }),
      );
      expect(mockPrisma.category.count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
        },
      });
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

    it('should build a recursive tree for categories deeper than three levels', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        {
          id: 'root',
          title: 'Beats',
          slug: 'beats',
          parentId: null,
          sortOrder: 1,
          _count: { products: 0 },
        },
        {
          id: 'child',
          title: 'Наушники',
          slug: 'naushniki-3',
          parentId: 'root',
          sortOrder: 1,
          _count: { products: 0 },
        },
        {
          id: 'grandchild',
          title: 'Studio Pro',
          slug: 'studio-pro',
          parentId: 'child',
          sortOrder: 1,
          _count: { products: 5 },
        },
        {
          id: 'great-grandchild',
          title: 'Limited',
          slug: 'limited',
          parentId: 'grandchild',
          sortOrder: 1,
          _count: { products: 1 },
        },
      ]);

      const result = await service.findTree();

      expect(result).toHaveLength(1);
      expect(result[0].children[0].children[0].children[0]).toEqual(
        expect.objectContaining({
          id: 'great-grandchild',
          title: 'Limited',
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

  describe('reorder', () => {
    it('should update category sort orders and invalidate cache', async () => {
      const items = [
        { id: 'cat-2', sortOrder: 1 },
        { id: 'cat-1', sortOrder: 2 },
      ];

      mockPrisma.category.count.mockResolvedValue(items.length);
      mockPrisma.category.update.mockImplementation((args) => args);
      mockPrisma.$transaction.mockResolvedValue([]);

      const result = await (service as any).reorder({ items });

      expect(mockPrisma.category.count).toHaveBeenCalledWith({
        where: {
          id: { in: ['cat-2', 'cat-1'] },
          isDeleted: false,
        },
      });
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-2' },
        data: { sortOrder: 1 },
      });
      expect(mockPrisma.category.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { sortOrder: 2 },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledWith([
        {
          where: { id: 'cat-2' },
          data: { sortOrder: 1 },
        },
        {
          where: { id: 'cat-1' },
          data: { sortOrder: 2 },
        },
      ]);
      expect(mockCacheService.invalidateAllCaches).toHaveBeenCalled();
      expect(result).toEqual({ updated: 2 });
    });

    it('should reject reorder when any category is missing', async () => {
      mockPrisma.category.count.mockResolvedValue(1);

      await expect(
        (service as any).reorder({
          items: [
            { id: 'cat-1', sortOrder: 1 },
            { id: 'missing', sortOrder: 2 },
          ],
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
