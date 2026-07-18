import { DashboardService } from './dashboard.service';
import * as fs from 'fs/promises';
import * as XLSX from 'xlsx';

describe('DashboardService import category extraction', () => {
  const service = new DashboardService({} as any, {} as any, {} as any);

  it('keeps imported accessories out of real product categories', () => {
    const categoryNames = (service as any).extractCategoryNames({
      Название: 'Чехол Apple Silicone Case для iPhone 16 Pro Max',
      Категория: 'Apple',
      Подкатегория: 'Смартфоны Apple iPhone',
      Раздел: 'iPhone 16 Pro Max',
    });

    expect(categoryNames).toEqual(['Аксессуары', 'Чехлы']);
  });
});

describe('DashboardService product XLSX import cache invalidation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('invalidates category and product caches after importing reassigned categories', async () => {
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    const tx = {
      category: {
        findFirst: jest.fn().mockResolvedValue({ id: 'category-tablets' }),
        create: jest.fn(),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'product-1', updatedAt: new Date() }),
      },
      productImportEntry: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      pickupPoint: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      productImportBatch: {
        create: jest.fn().mockResolvedValue({ id: 'batch-1' }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) =>
        callback(tx),
      ),
    };
    const categoryCache = {
      invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
    };
    const productCache = {
      invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
    };
    const service = new (DashboardService as any)(
      prisma,
      categoryCache,
      productCache,
    );

    const worksheet = XLSX.utils.json_to_sheet([
      {
        Название: 'Apple iPad Air 13 M3',
        Цена: 1000,
        'Категория (основная)': 'Apple - Планшеты',
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const result = await service.importProductsXlsx(buffer, 'products.xlsx');

    expect(categoryCache.invalidateAllCaches).toHaveBeenCalledTimes(1);
    expect(productCache.invalidateAllCaches).toHaveBeenCalledTimes(1);
    expect(prisma.productImportBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fileName: 'products.xlsx' }),
      }),
    );
    expect(tx.productImportEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          batchId: 'batch-1',
          productId: 'product-1',
          action: 'CREATED',
        }),
      }),
    );
    expect(result).toMatchObject({
      importBatchId: 'batch-1',
      undoAvailable: true,
    });
  });
});

describe('DashboardService XLSX import rollback', () => {
  it('restores an updated product from the latest import snapshot', async () => {
    const importedAt = new Date('2026-07-14T14:15:00.000Z');
    const snapshot = {
      brandId: 'brand-before',
      name: 'Товар до выгрузки',
      slug: 'product-before-import',
      description: 'Описание до выгрузки',
      price: '1000',
      oldPrice: '1200',
      isActive: true,
      isOnSale: true,
      categories: [{ categoryId: 'category-before', isPrimary: true }],
      images: [
        {
          url: 'https://example.com/before.jpg',
          alt: 'Фото до выгрузки',
          sortOrder: 0,
        },
      ],
      attributes: [{ name: 'Цвет', value: 'Синий' }],
      stocks: [{ pointId: 'point-1', sku: 'SKU-BEFORE', stockCount: 3 }],
    };
    const tx = {
      productImportBatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'batch-1',
          status: 'COMPLETED',
          completedAt: importedAt,
          createdCategories: [],
          createdBrands: [],
          entries: [
            {
              productId: 'product-1',
              action: 'UPDATED',
              beforeSnapshot: snapshot,
              afterUpdatedAt: importedAt,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-1',
            updatedAt: importedAt,
            _count: {
              orderItems: 0,
              reviews: 0,
              favorites: 0,
              relatedProducts: 0,
              relatedFromProducts: 0,
            },
          },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      productCategory: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      productImage: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      productAttribute: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      productStock: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) =>
        callback(tx),
      ),
    };
    const categoryCache = {
      invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
    };
    const productCache = {
      invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
    };
    const service = new (DashboardService as any)(
      prisma,
      categoryCache,
      productCache,
    );

    await expect(service.undoLatestProductsXlsxImport()).resolves.toEqual({
      batchId: 'batch-1',
      restored: 1,
      removed: 0,
      removedCategories: 0,
      removedBrands: 0,
      skipped: 0,
      status: 'UNDONE',
    });

    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product-1' },
        data: expect.objectContaining({
          name: 'Товар до выгрузки',
          price: '1000',
        }),
      }),
    );
    expect(tx.productCategory.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: 'product-1',
          categoryId: 'category-before',
          isPrimary: true,
        },
      ],
    });
    expect(tx.productImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1' },
        data: expect.objectContaining({ status: 'UNDONE' }),
      }),
    );
  });

  it('rolls back untouched entries and preserves entries changed after import', async () => {
    const importedAt = new Date('2026-07-15T14:00:00.000Z');
    const changedAt = new Date('2026-07-15T14:10:00.000Z');
    const snapshot = {
      brandId: null,
      name: 'Товар до выгрузки',
      slug: 'product-before-import',
      description: null,
      price: '1000',
      oldPrice: null,
      isActive: true,
      isOnSale: false,
      categories: [],
      images: [],
      attributes: [],
      stocks: [],
    };
    const tx = {
      productImportBatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'batch-1',
          status: 'COMPLETED',
          completedAt: importedAt,
          createdCategories: [],
          createdBrands: [],
          entries: [
            {
              productId: 'product-untouched',
              action: 'UPDATED',
              beforeSnapshot: snapshot,
              afterUpdatedAt: importedAt,
            },
            {
              productId: 'product-changed',
              action: 'UPDATED',
              beforeSnapshot: snapshot,
              afterUpdatedAt: importedAt,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'product-untouched',
            updatedAt: importedAt,
            _count: {
              orderItems: 0,
              reviews: 0,
              favorites: 0,
              relatedProducts: 0,
              relatedFromProducts: 0,
            },
          },
          {
            id: 'product-changed',
            updatedAt: changedAt,
            _count: {
              orderItems: 0,
              reviews: 0,
              favorites: 0,
              relatedProducts: 0,
              relatedFromProducts: 0,
            },
          },
        ]),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      productCategory: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      productImage: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      productAttribute: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      productStock: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) =>
        callback(tx),
      ),
    };
    const cache = {
      invalidateAllCaches: jest.fn().mockResolvedValue(undefined),
    };
    const service = new (DashboardService as any)(prisma, cache, cache);

    await expect(service.undoLatestProductsXlsxImport()).resolves.toEqual({
      batchId: 'batch-1',
      restored: 1,
      removed: 0,
      removedCategories: 0,
      removedBrands: 0,
      skipped: 1,
      status: 'PARTIALLY_UNDONE',
    });

    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'product-untouched' } }),
    );
    expect(tx.productImportBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PARTIALLY_UNDONE' }),
      }),
    );
  });
});

describe('DashboardService product XLSX export scopes', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exports a selected category with all of its child categories and brand', async () => {
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    const prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'apple', parentId: null },
          { id: 'iphone', parentId: 'apple' },
          { id: 'ipad', parentId: 'apple' },
        ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new (DashboardService as any)(prisma, {} as any, {} as any);

    await service.exportProductsXlsx('active', 'apple', 'brand-apple');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          brandId: 'brand-apple',
          categories: {
            some: { categoryId: { in: ['apple', 'iphone', 'ipad'] } },
          },
        },
      }),
    );
  });
});
