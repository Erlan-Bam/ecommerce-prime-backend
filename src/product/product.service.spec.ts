import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ProductService } from './product.service';
import { PrismaService } from '../shared/services/prisma.service';
import { ProductCacheService } from './services/cache.service';
import { CategoryCacheService } from '../category/services/cache.service';

const mockPrisma = {
  product: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  category: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  brand: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  productVariantGroup: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
  $transaction: jest.fn(),
};

const mockCacheService = {
  getCachedProduct: jest.fn().mockResolvedValue(null),
  getCachedProducts: jest.fn().mockResolvedValue(null),
  cacheProduct: jest.fn().mockResolvedValue(undefined),
  cacheProducts: jest.fn().mockResolvedValue(undefined),
  invalidateProduct: jest.fn().mockResolvedValue(undefined),
  invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
};

const mockCategoryCacheService = {
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
        { provide: CategoryCacheService, useValue: mockCategoryCacheService },
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

  describe('variant groups', () => {
    it('looks up product slug case-insensitively', async () => {
      const product = {
        id: 'case-slug-product',
        name: 'Case Slug Product',
        slug: 'product-CLT044m',
        price: 100,
        isDeleted: false,
        reviews: [],
        productStock: [],
        categories: [],
        brand: null,
        images: [],
        attributes: [],
      };

      mockPrisma.product.findFirst.mockResolvedValue(product);
      mockPrisma.product.update.mockResolvedValue(product);

      await service.findBySlug('product-clt044m');

      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            slug: {
              equals: 'product-clt044m',
              mode: 'insensitive',
            },
          },
        }),
      );
    });

    it('stores variant group fields when creating a product', async () => {
      mockPrisma.product.create.mockResolvedValue({
        id: 'iphone-black-256',
        name: 'iPhone 15 256GB Black',
        slug: 'iphone-15-256gb-black',
        price: 100000,
        variantGroupId: 'iphone-15-group',
        variantColor: 'Black',
        variantMemory: '256 GB',
        variantSim: 'nano-SIM + eSIM',
        categories: [],
        brand: null,
        images: [],
        attributes: [],
        productStock: [],
      });

      await service.create({
        name: 'iPhone 15 256GB Black',
        price: 100000,
        categoryIds: ['phones'],
        variantGroupId: 'iphone-15-group',
        variantColor: 'Black',
        variantMemory: '256 GB',
        variantSim: 'nano-SIM + eSIM',
      } as any);

      expect(mockPrisma.product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            variantGroup: { connect: { id: 'iphone-15-group' } },
            variantColor: 'Black',
            variantMemory: '256 GB',
            variantSim: 'nano-SIM + eSIM',
          }),
        }),
      );
    });

    it('adds stock totals to products linked through a variant group', async () => {
      const product = {
        id: 'iphone-black-256',
        name: 'iPhone 15 256GB Black',
        slug: 'iphone-15-256gb-black',
        price: 100000,
        isDeleted: false,
        reviews: [],
        productStock: [{ stockCount: 2 }],
        categories: [],
        brand: null,
        images: [],
        attributes: [],
        variantGroup: {
          id: 'iphone-15-group',
          name: 'iPhone 15',
          products: [
            {
              id: 'iphone-black-256',
              name: 'iPhone 15 256GB Black',
              slug: 'iphone-15-256gb-black',
              price: 100000,
              oldPrice: null,
              isActive: true,
              variantColor: 'Black',
              variantMemory: '256 GB',
              variantSim: 'nano-SIM + eSIM',
              images: [],
              attributes: [],
              productStock: [{ stockCount: 2 }, { stockCount: 1 }],
            },
          ],
        },
      };

      mockPrisma.product.findUnique.mockResolvedValue(product);
      mockPrisma.product.update.mockResolvedValue(product);

      const result = await service.findOne('iphone-black-256');

      expect(result.variantGroup.products).toEqual([
        expect.objectContaining({
          id: 'iphone-black-256',
          totalStock: 3,
        }),
      ]);
      expect(result.variantGroup.products[0]).not.toHaveProperty(
        'productStock',
      );
    });

    it('deletes a variant group and unlinks its products', async () => {
      mockPrisma.productVariantGroup.findUnique.mockResolvedValue({
        id: 'iphone-group',
      });
      mockPrisma.product.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.productVariantGroup.delete.mockResolvedValue({
        id: 'iphone-group',
        name: 'iPhone group',
      });
      mockPrisma.$transaction.mockImplementation((callback) =>
        callback(mockPrisma),
      );

      await expect(service.deleteVariantGroup('iphone-group')).resolves.toEqual(
        {
          id: 'iphone-group',
          unlinkedProducts: 2,
        },
      );

      expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
        where: { variantGroupId: 'iphone-group' },
        data: { variantGroupId: null },
      });
      expect(mockPrisma.productVariantGroup.delete).toHaveBeenCalledWith({
        where: { id: 'iphone-group' },
      });
      expect(mockCacheService.invalidateAllCaches).toHaveBeenCalled();
    });
  });

  describe('findAll - query filtering', () => {
    it('should include isDeleted: false in where clause', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);
      mockPrisma.category.findUnique.mockResolvedValue(null);
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

    it('should exclude accessory subcategories from headphones catalog', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);
      mockPrisma.category.findUnique.mockResolvedValue({ slug: 'naushniki' });
      mockPrisma.category.findMany.mockImplementation(({ where }) => {
        if (where.parentId === 'headphones-category') {
          return Promise.resolve([
            { id: 'airpods-pro-2', slug: 'airpods-pro-2' },
            { id: 'airpods-cases', slug: 'chehly-dlya-airpods' },
            { id: 'magssory-accessories', slug: 'magssory' },
            { id: 'earpods', slug: 'earpods' },
          ]);
        }

        return Promise.resolve([]);
      });

      await service.findAll({
        page: 1,
        limit: 20,
        categoryId: 'headphones-category',
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categories: {
              some: {
                categoryId: {
                  in: ['headphones-category', 'airpods-pro-2', 'earpods'],
                },
              },
            },
          }),
        }),
      );
    });

    it('should exclude Apple accessories from the Apple catalog root', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);
      mockPrisma.category.findUnique.mockResolvedValue({ slug: 'apple' });
      mockPrisma.category.findMany.mockImplementation(({ where }) => {
        if (where.parentId === 'apple-category') {
          return Promise.resolve([
            { id: 'apple-phones', slug: 'smartfony-apple-iphone' },
            { id: 'apple-accessories', slug: 'aksessuary-1' },
            { id: 'apple-watches', slug: 'chasy-1' },
          ]);
        }

        return Promise.resolve([]);
      });

      await service.findAll({
        page: 1,
        limit: 20,
        categoryId: 'apple-category',
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categories: {
              some: {
                categoryId: {
                  in: ['apple-category', 'apple-phones', 'apple-watches'],
                },
              },
            },
          }),
        }),
      );
    });

    it('should combine different attribute filters with AND', async () => {
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.product.count.mockResolvedValue(0);
      mockPrisma.category.findUnique.mockResolvedValue(null);
      mockPrisma.category.findMany.mockResolvedValue([]);

      await service.findAll({
        page: 1,
        limit: 20,
        attributes: JSON.stringify({
          SIM: ['1SIM', '2SIM'],
          Материал: ['Силикон'],
        }),
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              {
                attributes: {
                  some: {
                    OR: expect.arrayContaining([
                      {
                        name: 'SIM',
                        value: { contains: '1SIM', mode: 'insensitive' },
                      },
                      {
                        name: 'Параметр: SIM',
                        value: { contains: '2SIM', mode: 'insensitive' },
                      },
                    ]),
                  },
                },
              },
              {
                attributes: {
                  some: {
                    OR: expect.arrayContaining([
                      {
                        name: 'Материал',
                        value: { contains: 'Силикон', mode: 'insensitive' },
                      },
                      {
                        name: 'Параметр: Материал',
                        value: { contains: 'Силикон', mode: 'insensitive' },
                      },
                    ]),
                  },
                },
              },
            ],
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

  describe('update', () => {
    it('clears images without creating an empty image batch', async () => {
      const productId = 'prod-empty-images';
      const existingProduct = {
        id: productId,
        name: 'Test Product',
        slug: 'test-product',
        price: 100,
        isDeleted: false,
        reviews: [],
        productStock: [],
        categories: [],
        brand: null,
        images: [],
        attributes: [],
      };

      mockPrisma.product.findUnique.mockResolvedValue(existingProduct);
      mockPrisma.product.update.mockImplementation(({ data }) => {
        if (data.viewCount) return Promise.resolve(existingProduct);
        return Promise.resolve(existingProduct);
      });
      mockPrisma.productImage.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.productImage.createMany.mockResolvedValue({ count: 0 });

      await service.update(productId, { images: [] });

      expect(mockPrisma.productImage.deleteMany).toHaveBeenCalledWith({
        where: { productId },
      });
      expect(mockPrisma.productImage.createMany).not.toHaveBeenCalled();
    });

    it('keeps the current slug when saving without changing the product name', async () => {
      const productId = 'prod-duplicate-name';
      const existingProduct = {
        id: productId,
        name: 'Смартфон Apple iPhone 17 Pro Max 1ТБ Синий',
        slug: 'smartfon-apple-iphone-17-pro-max-1tb-sinij-2',
        price: 156990,
        isDeleted: false,
        reviews: [],
        productStock: [],
        categories: [],
        brand: null,
        images: [],
        attributes: [],
      };

      mockPrisma.product.findUnique.mockResolvedValue(existingProduct);
      mockPrisma.product.update.mockImplementation(({ data }) => {
        if (data.viewCount) return Promise.resolve(existingProduct);
        return Promise.resolve({ ...existingProduct, ...data });
      });

      await service.update(productId, {
        name: existingProduct.name,
        price: 156990,
      });

      const saveCall = mockPrisma.product.update.mock.calls.find(
        ([args]) => args.where.id === productId && !args.data.viewCount,
      );

      expect(saveCall?.[0].data).toEqual(
        expect.objectContaining({
          name: existingProduct.name,
          price: 156990,
        }),
      );
      expect(saveCall?.[0].data).not.toHaveProperty('slug');
    });

    it('connects a variant group through the relation when updating a product', async () => {
      const productId = 'prod-variant-group';
      const existingProduct = {
        id: productId,
        name: 'iPhone 17 Pro Max',
        slug: 'iphone-17-pro-max',
        price: 156990,
        isDeleted: false,
        reviews: [],
        productStock: [],
        categories: [],
        brand: null,
        images: [],
        attributes: [],
      };

      mockPrisma.product.findUnique.mockResolvedValue(existingProduct);
      mockPrisma.product.update.mockImplementation(({ data }) => {
        if (data.viewCount) return Promise.resolve(existingProduct);
        return Promise.resolve({ ...existingProduct, ...data });
      });

      await service.update(productId, {
        brandId: 'brand-apple',
        variantGroupId: 'variant-group-iphone-17',
        variantColor: 'Белый',
        variantMemory: '1ТБ',
        variantSim: 'esim',
      } as any);

      const saveCall = mockPrisma.product.update.mock.calls.find(
        ([args]) => args.where.id === productId && !args.data.viewCount,
      );

      expect(saveCall?.[0].data).toEqual(
        expect.objectContaining({
          brand: { connect: { id: 'brand-apple' } },
          variantGroup: { connect: { id: 'variant-group-iphone-17' } },
          variantColor: 'Белый',
          variantMemory: '1ТБ',
          variantSim: 'esim',
        }),
      );
      expect(saveCall?.[0].data).not.toHaveProperty('variantGroupId');
    });

    it('clears category counts after changing product categories', async () => {
      const productId = 'prod-categories';
      const existingProduct = {
        id: productId,
        name: 'Test Product',
        slug: 'test-product',
        price: 100,
        isDeleted: false,
        reviews: [],
        productStock: [],
        categories: [],
        brand: null,
        images: [],
        attributes: [],
      };

      mockPrisma.product.findUnique.mockResolvedValue(existingProduct);
      mockPrisma.product.update.mockResolvedValue(existingProduct);
      mockPrisma.productCategory.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.productCategory.createMany.mockResolvedValue({ count: 1 });

      await service.update(productId, { categoryIds: ['category-new'] });

      expect(mockPrisma.productCategory.deleteMany).toHaveBeenCalledWith({
        where: { productId },
      });
      expect(mockPrisma.productCategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            productId,
            categoryId: 'category-new',
            isPrimary: true,
          },
        ],
      });
      expect(mockCategoryCacheService.invalidateAllCaches).toHaveBeenCalled();
    });
  });

  describe('bulkUpdateCategories', () => {
    it('replaces categories for selected products and sets the new category as primary', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({
        id: 'cat-target',
        isDeleted: false,
      });
      mockPrisma.product.count.mockResolvedValue(2);
      mockPrisma.productCategory.deleteMany.mockResolvedValue({ count: 4 });
      mockPrisma.productCategory.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.product.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.$transaction.mockImplementation((operations) =>
        Promise.all(operations),
      );

      const result = await service.bulkUpdateCategories({
        productIds: ['prod-1', 'prod-2'],
        categoryId: 'cat-target',
      });

      expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-target' },
        select: { id: true, isDeleted: true },
      });
      expect(mockPrisma.product.count).toHaveBeenCalledWith({
        where: {
          id: { in: ['prod-1', 'prod-2'] },
          isDeleted: false,
        },
      });
      expect(mockPrisma.productCategory.deleteMany).toHaveBeenCalledWith({
        where: { productId: { in: ['prod-1', 'prod-2'] } },
      });
      expect(mockPrisma.productCategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            productId: 'prod-1',
            categoryId: 'cat-target',
            isPrimary: true,
          },
          {
            productId: 'prod-2',
            categoryId: 'cat-target',
            isPrimary: true,
          },
        ],
      });
      expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['prod-1', 'prod-2'] } },
        data: { updatedAt: expect.any(Date) },
      });
      expect(mockCacheService.invalidateAllCaches).toHaveBeenCalled();
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith('prod-1');
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith('prod-2');
      expect(result).toEqual({
        updated: 2,
        categoryId: 'cat-target',
      });
    });
  });

  describe('getFilters', () => {
    it('returns only shopper-facing facets for the filtered category and brand', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({ slug: 'apple' });
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.brand.findMany.mockResolvedValue([
        { id: 'brand-apple', name: 'Apple', slug: 'apple' },
      ]);
      mockPrisma.product.aggregate.mockResolvedValue({
        _min: { price: 100000 },
        _max: { price: 400000 },
      });
      mockPrisma.productAttribute.groupBy.mockResolvedValue([
        { name: 'Объем памяти', value: '256Gb', _count: 1 },
        { name: 'Объём памяти', value: '64 ГБ', _count: 1 },
        { name: 'Память', value: '1TB', _count: 1 },
        { name: 'Встроенная память', value: '128 Гб', _count: 1 },
        { name: 'Память', value: '120 ГБ/с', _count: 1 },
        { name: 'Параметр: Цвет', value: 'Чёрный', _count: 1 },
        { name: 'Цвет', value: 'Белый', _count: 1 },
        { name: 'Ширина', value: '71,5 мм', _count: 1 },
      ]);

      const result = await service.getFilters('category-apple', [
        'brand-apple',
      ]);

      const expectedWhere = {
        isDeleted: false,
        isActive: true,
        categories: { some: { categoryId: 'category-apple' } },
        brandId: { in: ['brand-apple'] },
      };

      expect(mockPrisma.product.aggregate).toHaveBeenCalledWith({
        where: expectedWhere,
        _min: { price: true },
        _max: { price: true },
      });
      expect(mockPrisma.productAttribute.groupBy).toHaveBeenCalledWith({
        by: ['name', 'value'],
        where: { product: expectedWhere },
        _count: true,
      });
      expect(result).toEqual({
        brands: [{ id: 'brand-apple', name: 'Apple', slug: 'apple' }],
        priceRange: { min: 100000, max: 400000 },
        attributes: {
          'Объём памяти': ['64 ГБ', '128 ГБ', '256 ГБ', '1 ТБ'],
          Цвет: ['Белый', 'Чёрный'],
        },
      });
    });

    it('uses a brand slug as the catalog scope instead of a stale brand checkbox', async () => {
      mockPrisma.category.findUnique.mockResolvedValue({
        slug: 'samsung',
        filterAttributes: [],
      });
      mockPrisma.category.findMany.mockResolvedValue([]);
      mockPrisma.brand.findUnique.mockResolvedValue({
        id: 'brand-samsung',
        isActive: true,
        isDeleted: false,
      });
      mockPrisma.brand.findMany.mockResolvedValue([
        { id: 'brand-samsung', name: 'Samsung', slug: 'samsung' },
      ]);
      mockPrisma.product.aggregate.mockResolvedValue({
        _min: { price: 1000 },
        _max: { price: 2000 },
      });
      mockPrisma.productAttribute.groupBy.mockResolvedValue([]);

      await service.getFilters('category-samsung', ['brand-honor'], 'samsung');

      expect(mockPrisma.product.aggregate).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          isActive: true,
          categories: { some: { categoryId: 'category-samsung' } },
          brandId: { in: ['brand-samsung'] },
        },
        _min: { price: true },
        _max: { price: true },
      });
    });
  });

  describe('getCatalogCleanupSuggestions', () => {
    it('does not suggest moving Samsung MagSafe cases into Apple accessories', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'apple-cases',
          title: 'Чехлы Apple',
          slug: 'chehly-apple',
          parentId: 'apple-accessories',
        },
        { id: 'samsung', title: 'Samsung', slug: 'samsung', parentId: null },
        {
          id: 'samsung-accessories',
          title: 'Аксессуары Samsung',
          slug: 'aksessuary-2',
          parentId: 'samsung',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'samsung-case',
          name: 'Чехол прозрачный для Samsung с MagSafe',
          slug: 'samsung-magsafe-case',
          description: null,
          brand: { name: 'Samsung', slug: 'samsung' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'samsung-accessories',
                title: 'Аксессуары Samsung',
                slug: 'aksessuary-2',
                parentId: 'samsung',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([]);
    });

    it('moves Samsung MagSafe cases out of Apple cases into Samsung cases', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'apple-cases',
          title: 'Чехлы Apple',
          slug: 'chehly-apple',
          parentId: 'apple-accessories',
        },
        { id: 'samsung', title: 'Samsung', slug: 'samsung', parentId: null },
        {
          id: 'samsung-accessories',
          title: 'Аксессуары Samsung',
          slug: 'aksessuary-2',
          parentId: 'samsung',
        },
        {
          id: 'samsung-cases',
          title: 'Чехлы',
          slug: 'chehly-samsung',
          parentId: 'samsung-accessories',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'samsung-case',
          name: 'Чехол прозрачный для Samsung с MagSafe',
          slug: 'samsung-magsafe-case',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple-cases',
                title: 'Чехлы Apple',
                slug: 'chehly-apple',
                parentId: 'apple-accessories',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'samsung-case',
          targetCategoryId: 'samsung-cases',
          targetCategoryPath: ['Samsung', 'Аксессуары Samsung', 'Чехлы'],
        }),
      ]);
    });

    it('does not treat MagSafe-only cross-device Magssory kits as Samsung cases', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        { id: 'samsung', title: 'Samsung', slug: 'samsung', parentId: null },
        {
          id: 'samsung-accessories',
          title: 'Аксессуары Samsung',
          slug: 'aksessuary-samsung',
          parentId: 'samsung',
        },
        {
          id: 'samsung-cases',
          title: 'Чехлы Samsung',
          slug: 'chehly-samsung',
          parentId: 'samsung-accessories',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'magssory-disc',
          name: 'Автомобильный комплект Magssory Disc для Samsung и Apple, совместимый с MagSafe',
          slug: 'magssory-disc-samsung-apple',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple',
                title: 'Apple',
                slug: 'apple',
                parentId: null,
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([]);
    });

    it('suggests Beats headphones under the Beats branch instead of Apple headphones', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-headphones',
          title: 'Наушники Apple AirPods и Beats',
          slug: 'naushniki-apple-airpods-i-beats',
          parentId: 'apple',
        },
        { id: 'beats', title: 'Beats', slug: 'beats', parentId: null },
        {
          id: 'beats-studio-pro',
          title: 'Studio Pro',
          slug: 'studio-pro',
          parentId: 'beats',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'beats-product',
          name: 'Беспроводные наушники Beats Studio Pro Wireless',
          slug: 'beats-studio-pro-wireless',
          description: null,
          brand: { name: 'Beats', slug: 'beats' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple-headphones',
                title: 'Наушники Apple AirPods и Beats',
                slug: 'naushniki-apple-airpods-i-beats',
                parentId: 'apple',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'beats-product',
          targetCategoryId: 'beats-studio-pro',
          targetCategoryPath: ['Beats', 'Studio Pro'],
        }),
      ]);
    });

    it('suggests Beats branch even when a Beats product was imported with Apple brand', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-headphones',
          title: 'Наушники Apple AirPods и Beats',
          slug: 'naushniki-apple-airpods-i-beats',
          parentId: 'apple',
        },
        { id: 'beats', title: 'Beats', slug: 'beats', parentId: null },
        {
          id: 'beats-headphones',
          title: 'Наушники',
          slug: 'naushniki-beats',
          parentId: 'beats',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'beats-product',
          name: 'Beats Solo 4 Wireless Headphones',
          slug: 'beats-solo-4-wireless-headphones',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple-headphones',
                title: 'Наушники Apple AirPods и Beats',
                slug: 'naushniki-apple-airpods-i-beats',
                parentId: 'apple',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'beats-product',
          targetCategoryId: 'beats-headphones',
          targetCategoryPath: ['Beats', 'Наушники'],
        }),
      ]);
    });

    it('chooses the exact iPhone 17 category instead of a Pro Max partial match', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'iphone-17-pro-max',
          title: 'Аксессуары для iPhone 17 Pro Max',
          slug: 'dlya-iphone-17-pro-max-2',
          parentId: 'apple-accessories',
        },
        {
          id: 'iphone-17',
          title: 'для iPhone 17',
          slug: 'dlya-iphone-17-1',
          parentId: 'apple-accessories',
        },
        {
          id: 'apple-phones',
          title: 'Смартфоны Apple iPhone',
          slug: 'smartfony-apple-iphone',
          parentId: 'apple',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'iphone-17-case',
          name: 'Чехол Apple Clear Case для iPhone 17',
          slug: 'iphone-17-clear-case',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple-phones',
                title: 'Смартфоны Apple iPhone',
                slug: 'smartfony-apple-iphone',
                parentId: 'apple',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'iphone-17-case',
          targetCategoryId: 'iphone-17',
          targetCategoryPath: ['Apple', 'Аксессуары Apple', 'для iPhone 17'],
        }),
      ]);
    });

    it('chooses the exact iPhone 17 Pro category instead of a Pro Max partial match', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'iphone-17-pro-max',
          title: 'Аксессуары для iPhone 17 Pro Max',
          slug: 'dlya-iphone-17-pro-max-2',
          parentId: 'apple-accessories',
        },
        {
          id: 'iphone-17-pro',
          title: 'для iPhone 17 Pro',
          slug: 'dlya-iphone-17-pro-1',
          parentId: 'apple-accessories',
        },
        {
          id: 'apple-phones',
          title: 'Смартфоны Apple iPhone',
          slug: 'smartfony-apple-iphone',
          parentId: 'apple',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'iphone-17-pro-case',
          name: 'Чехол Apple Clear Case для iPhone 17 Pro',
          slug: 'iphone-17-pro-clear-case',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple-phones',
                title: 'Смартфоны Apple iPhone',
                slug: 'smartfony-apple-iphone',
                parentId: 'apple',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'iphone-17-pro-case',
          targetCategoryId: 'iphone-17-pro',
          targetCategoryPath: [
            'Apple',
            'Аксессуары Apple',
            'для iPhone 17 Pro',
          ],
        }),
      ]);
    });

    it('treats protective iPhone cases as cases, not protective glass', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'iphone-17-pro',
          title: 'для iPhone 17 Pro',
          slug: 'dlya-iphone-17-pro-1',
          parentId: 'apple-accessories',
        },
        {
          id: 'iphone-17-pro-max',
          title: 'Аксессуары для iPhone 17 Pro Max',
          slug: 'dlya-iphone-17-pro-max-2',
          parentId: 'apple-accessories',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'protective-case',
          name: 'Чехол защитный Rocket Frost для iPhone 17 Pro, MagSafe совместимый',
          slug: 'rocket-frost-iphone-17-pro',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'iphone-17-pro-max',
                title: 'Аксессуары для iPhone 17 Pro Max',
                slug: 'dlya-iphone-17-pro-max-2',
                parentId: 'apple-accessories',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'protective-case',
          targetCategoryId: 'iphone-17-pro',
          reason: 'чехол для iPhone 17 Pro',
        }),
      ]);
    });

    it('routes iPhone 17 Air accessories to the iPhone Air category', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'iphone-17',
          title: 'для iPhone 17',
          slug: 'dlya-iphone-17-1',
          parentId: 'apple-accessories',
        },
        {
          id: 'iphone-air',
          title: 'для iPhone Air',
          slug: 'dlya-iphone-air-1',
          parentId: 'apple-accessories',
        },
        {
          id: 'iphone-17-pro-max',
          title: 'Аксессуары для iPhone 17 Pro Max',
          slug: 'dlya-iphone-17-pro-max-2',
          parentId: 'apple-accessories',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'iphone-air-case',
          name: 'Чехол защитный Rocket Silk для iPhone 17 Air, MagSafe совместимый',
          slug: 'rocket-silk-iphone-17-air',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'iphone-17-pro-max',
                title: 'Аксессуары для iPhone 17 Pro Max',
                slug: 'dlya-iphone-17-pro-max-2',
                parentId: 'apple-accessories',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'iphone-air-case',
          targetCategoryId: 'iphone-air',
          reason: 'чехол для iPhone Air',
        }),
      ]);
    });

    it('routes Apple input devices with USB-C to keyboards instead of cables', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'apple-keyboards',
          title: 'Клавиатуры Apple',
          slug: 'klaviatury-1',
          parentId: 'apple-accessories',
        },
        {
          id: 'apple-cables',
          title: 'Кабели',
          slug: 'kabeli',
          parentId: 'apple-accessories',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'magic-mouse',
          name: 'Беспроводная мышь Apple Magic Mouse 3 (USB-C) White',
          slug: 'magic-mouse-3-usb-c-white',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple',
                title: 'Apple',
                slug: 'apple',
                parentId: null,
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'magic-mouse',
          targetCategoryId: 'apple-keyboards',
          reason: 'клавиатура/стилус Apple',
        }),
      ]);
    });

    it('routes MagSafe power banks to chargers instead of cables', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'apple-chargers',
          title: 'Зарядные устройства',
          slug: 'zaryadnye-ustrojstva',
          parentId: 'apple-accessories',
        },
        {
          id: 'apple-cables',
          title: 'Кабели',
          slug: 'kabeli',
          parentId: 'apple-accessories',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'magsafe-power-bank',
          name: 'Внешний аккумулятор Energea AluPac MINI 5K MagSafe 15W USB-C 20W',
          slug: 'energea-alupac-mini-magsafe',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple',
                title: 'Apple',
                slug: 'apple',
                parentId: null,
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([
        expect.objectContaining({
          productId: 'magsafe-power-bank',
          targetCategoryId: 'apple-chargers',
          reason: 'зарядка/адаптер лежит не в зарядках',
        }),
      ]);
    });

    it('keeps Apple cases already inside Apple accessories untouched by generic cleanup', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-accessories',
          title: 'Аксессуары Apple',
          slug: 'aksessuary-1',
          parentId: 'apple',
        },
        {
          id: 'apple-cases-generic',
          title: 'Чехлы',
          slug: 'chehly',
          parentId: 'apple-accessories',
        },
        {
          id: 'apple-cases',
          title: 'Чехлы Apple',
          slug: 'chehly-apple',
          parentId: 'apple-accessories',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'apple-case',
          name: 'Чехол Apple Silicone Case для iPhone 16 Pro Max',
          slug: 'apple-silicone-case-iphone-16-pro-max',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple-cases',
                title: 'Чехлы Apple',
                slug: 'chehly-apple',
                parentId: 'apple-accessories',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.getCatalogCleanupSuggestions(20);

      expect(result.suggestions).toEqual([]);
    });
  });

  describe('applyCatalogCleanup', () => {
    it('previews cleanup suggestions without changing categories by default', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-cases',
          title: 'Чехлы Apple',
          slug: 'chehly-apple',
          parentId: 'apple',
        },
        { id: 'samsung', title: 'Samsung', slug: 'samsung', parentId: null },
        {
          id: 'samsung-cases',
          title: 'Чехлы',
          slug: 'chehly-samsung',
          parentId: 'samsung',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'samsung-case',
          name: 'Чехол прозрачный для Samsung с MagSafe',
          slug: 'samsung-magsafe-case',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple-cases',
                title: 'Чехлы Apple',
                slug: 'chehly-apple',
                parentId: 'apple',
              },
            },
          ],
          attributes: [],
        },
      ]);

      const result = await service.applyCatalogCleanup({
        excludedProductIds: ['samsung-case'],
      });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          dryRun: true,
          scanned: 1,
          suggested: 1,
          applicable: 0,
          excluded: 1,
          applied: 0,
        }),
      );
      expect(result.suggestions[0]).toEqual(
        expect.objectContaining({
          productId: 'samsung-case',
          skipped: true,
          skipReason: 'excluded',
        }),
      );
    });

    it('applies cleanup suggestions by replacing product categories', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 'apple', title: 'Apple', slug: 'apple', parentId: null },
        {
          id: 'apple-cases',
          title: 'Чехлы Apple',
          slug: 'chehly-apple',
          parentId: 'apple',
        },
        { id: 'samsung', title: 'Samsung', slug: 'samsung', parentId: null },
        {
          id: 'samsung-cases',
          title: 'Чехлы',
          slug: 'chehly-samsung',
          parentId: 'samsung',
        },
      ]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 'samsung-case',
          name: 'Чехол прозрачный для Samsung с MagSafe',
          slug: 'samsung-magsafe-case',
          description: null,
          brand: { name: 'Apple', slug: 'apple' },
          categories: [
            {
              isPrimary: true,
              category: {
                id: 'apple-cases',
                title: 'Чехлы Apple',
                slug: 'chehly-apple',
                parentId: 'apple',
              },
            },
          ],
          attributes: [],
        },
      ]);
      mockPrisma.productCategory.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.productCategory.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.$transaction.mockImplementationOnce((operations) =>
        Promise.all(operations),
      );

      const result = await service.applyCatalogCleanup({
        dryRun: false,
        limit: 20,
      });

      expect(mockPrisma.productCategory.deleteMany).toHaveBeenCalledWith({
        where: { productId: { in: ['samsung-case'] } },
      });
      expect(mockPrisma.productCategory.createMany).toHaveBeenCalledWith({
        data: [
          {
            productId: 'samsung-case',
            categoryId: 'samsung-cases',
            isPrimary: true,
          },
        ],
      });
      expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['samsung-case'] } },
        data: { updatedAt: expect.any(Date) },
      });
      expect(mockCacheService.invalidateAllCaches).toHaveBeenCalled();
      expect(mockCacheService.invalidateProduct).toHaveBeenCalledWith(
        'samsung-case',
      );
      expect(result).toEqual(
        expect.objectContaining({
          dryRun: false,
          suggested: 1,
          applicable: 1,
          applied: 1,
        }),
      );
      expect(result.appliedItems).toEqual([
        expect.objectContaining({
          productId: 'samsung-case',
          targetCategoryId: 'samsung-cases',
        }),
      ]);
    });
  });
});
