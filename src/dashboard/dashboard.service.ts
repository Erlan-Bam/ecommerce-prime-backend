import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  isAccessoryLikeProduct,
  normalizeCategoryNamesForImport,
} from '../shared/lib/catalog-classification';
import {
  applyVariantPriceColumnsToAttributes,
  getFirstVariantPriceFromRow,
  getVariantPriceColumns,
} from './product-xlsx-variants';
import { CategoryCacheService } from '../category/services/cache.service';
import { ProductCacheService } from '../product/services/cache.service';

type ImportRow = Record<string, unknown>;
type PrismaTx = any;

interface ParsedImportRow {
  rowNumber: number;
  sourceId: string | null;
  sourceSlug: string | null;
  name: string;
  description: string | null;
  price: number;
  oldPrice: number | null;
  isActive: boolean;
  isOnSale: boolean;
  brandName: string | null;
  categoryNames: string[];
  images: string[];
  attributes: Array<{ name: string; value: string }>;
  sku: string | null;
  stockCount: number | null;
}

interface ProductImportSnapshot {
  brandId: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  oldPrice: string | null;
  isActive: boolean;
  isOnSale: boolean;
  categories: Array<{ categoryId: string; isPrimary: boolean }>;
  images: Array<{ url: string; alt: string | null; sortOrder: number }>;
  attributes: Array<{ name: string; value: string }>;
  stocks: Array<{ pointId: string; sku: string; stockCount: number }>;
}

interface CreatedImportEntity {
  id: string;
  updatedAt: string;
}

interface ImportUndoContext {
  createdCategories: Map<string, string>;
  createdBrands: Map<string, string>;
}

const TECHNICAL_IMPORT_ATTRIBUTE_NAMES = new Set([
  'id оффера',
  'группа оффера',
  'категория источника',
  'путь источника',
  'source id',
  'source slug',
  'offer id',
  'offer group',
]);

const CONFIGURATION_ATTRIBUTE_NAMES = new Set([
  'конфигурации',
  'конфигурации товара',
  'конфигурации цены',
  'variant configurations',
  'product configurations',
  'configurations',
]);

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categoryCacheService: CategoryCacheService,
    private readonly productCacheService: ProductCacheService,
  ) {}

  private parseExportActivityFilter(
    activity?: string,
  ): { isActive?: boolean } | undefined {
    const normalized = activity?.toLowerCase().trim();
    if (!normalized || normalized === 'all') return undefined;
    if (normalized === 'active' || normalized === 'true') {
      return { isActive: true };
    }
    if (normalized === 'inactive' || normalized === 'false') {
      return { isActive: false };
    }

    return undefined;
  }

  async getDashboardStats() {
    try {
      // Получаем дату начала предыдущего месяца для сравнения
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const previousMonthEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
      );

      // Запросы для текущего периода
      const [
        totalRevenue,
        previousRevenue,
        totalOrders,
        previousOrders,
        totalProducts,
        previousProducts,
        totalUsers,
        previousUsers,
      ] = await Promise.all([
        // Общая выручка (текущий месяц)
        this.prisma.order.aggregate({
          where: {
            status: { in: ['DELIVERED', 'SHIPPED'] },
            createdAt: { gte: currentMonthStart },
          },
          _sum: { finalTotal: true },
        }),
        // Выручка за предыдущий месяц
        this.prisma.order.aggregate({
          where: {
            status: { in: ['DELIVERED', 'SHIPPED'] },
            createdAt: {
              gte: previousMonthStart,
              lte: previousMonthEnd,
            },
          },
          _sum: { finalTotal: true },
        }),
        // Количество заказов (текущий месяц)
        this.prisma.order.count({
          where: {
            createdAt: { gte: currentMonthStart },
          },
        }),
        // Количество заказов (предыдущий месяц)
        this.prisma.order.count({
          where: {
            createdAt: {
              gte: previousMonthStart,
              lte: previousMonthEnd,
            },
          },
        }),
        // Количество товаров (текущие)
        this.prisma.product.count({
          where: { isActive: true },
        }),
        // Количество товаров на начало месяца (приблизительно)
        this.prisma.product.count({
          where: {
            isActive: true,
            createdAt: { lt: currentMonthStart },
          },
        }),
        // Количество пользователей (текущие)
        this.prisma.user.count(),
        // Количество пользователей на начало месяца
        this.prisma.user.count({
          where: {
            createdAt: { lt: currentMonthStart },
          },
        }),
      ]);

      // Вычисляем проценты изменений
      const revenueChange = this.calculatePercentageChange(
        totalRevenue._sum.finalTotal?.toNumber() || 0,
        previousRevenue._sum.finalTotal?.toNumber() || 0,
      );

      const ordersChange = this.calculatePercentageChange(
        totalOrders,
        previousOrders,
      );

      const productsChange = this.calculatePercentageChange(
        totalProducts,
        previousProducts,
      );

      const usersChange = this.calculatePercentageChange(
        totalUsers,
        previousUsers,
      );

      return {
        revenue: {
          value: totalRevenue._sum.finalTotal?.toNumber() || 0,
          change: revenueChange,
          changeType: revenueChange >= 0 ? 'positive' : 'negative',
        },
        orders: {
          value: totalOrders,
          change: ordersChange,
          changeType: ordersChange >= 0 ? 'positive' : 'negative',
        },
        products: {
          value: totalProducts,
          change: productsChange,
          changeType: productsChange >= 0 ? 'positive' : 'negative',
        },
        users: {
          value: totalUsers,
          change: usersChange,
          changeType: usersChange >= 0 ? 'positive' : 'negative',
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting dashboard stats: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getRecentOrders(limit = 5) {
    try {
      const orders = await this.prisma.order.findMany({
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return orders.map((order) => ({
        id: order.id,
        customer: order.email,
        amount: order.finalTotal.toNumber(),
        status: this.mapStatus(order.status),
        statusType: this.getStatusType(order.status),
        createdAt: order.createdAt,
      }));
    } catch (error) {
      this.logger.error(
        `Error getting recent orders: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getParserStatus() {
    try {
      const parserScriptPath = path.resolve(
        process.cwd(),
        'prisma',
        'parse-technodeus.ts',
      );
      const productsFilePath = path.resolve(
        process.cwd(),
        'public',
        'products.xlsx',
      );

      const [scriptStat, fileStat] = await Promise.all([
        fs.stat(parserScriptPath).catch(() => null),
        fs.stat(productsFilePath).catch(() => null),
      ]);

      let parsedRows = 0;
      if (fileStat) {
        try {
          const workbook = XLSX.readFile(productsFilePath, { cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          if (firstSheetName) {
            const rows = XLSX.utils.sheet_to_json(
              workbook.Sheets[firstSheetName],
              {
                header: 1,
              },
            ) as unknown[][];
            parsedRows = Math.max(rows.length - 1, 0);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to parse parser output file: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      const [totalProducts, activeProducts, inactiveProducts] =
        await Promise.all([
          this.prisma.product.count(),
          this.prisma.product.count({ where: { isActive: true } }),
          this.prisma.product.count({ where: { isActive: false } }),
        ]);

      return {
        parserScriptExists: Boolean(scriptStat),
        productsFileExists: Boolean(fileStat),
        productsFilePath,
        parserScriptPath,
        lastParsedAt: fileStat ? fileStat.mtime : null,
        productsFileSizeBytes: fileStat ? fileStat.size : 0,
        parsedRows,
        database: {
          totalProducts,
          activeProducts,
          inactiveProducts,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting parser status: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }

  async exportProductsXlsx(
    activity?: string,
    categoryId?: string,
    brandId?: string,
  ) {
    try {
      const activityFilter = this.parseExportActivityFilter(activity);
      const categoryIds = await this.getExportCategoryIds(categoryId);
      const where = {
        ...activityFilter,
        ...(categoryIds.length > 0 && {
          categories: { some: { categoryId: { in: categoryIds } } },
        }),
        ...(brandId && { brandId }),
      };
      const products = await this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          brand: { select: { id: true, name: true, slug: true } },
          categories: {
            include: {
              category: { select: { id: true, title: true, slug: true } },
            },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          },
          images: {
            select: { url: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          },
          attributes: {
            select: { name: true, value: true },
            orderBy: { name: 'asc' },
          },
          productStock: {
            select: { sku: true, stockCount: true },
            orderBy: { updatedAt: 'desc' },
          },
        },
      });

      const rows = products.map((product) => {
        const primaryCategory =
          product.categories.find((item) => item.isPrimary)?.category ?? null;
        const allCategories = product.categories
          .map((item) => item.category?.title)
          .filter(Boolean)
          .join(' | ');
        const images = product.images.map((image) => image.url).join('\n');
        const attributes = product.attributes
          .map((attribute) => `${attribute.name}: ${attribute.value}`)
          .join('\n');
        const skus = product.productStock
          .map((stock) => stock.sku)
          .filter(Boolean)
          .join(', ');
        const totalStock = product.productStock.reduce(
          (sum, stock) => sum + stock.stockCount,
          0,
        );

        const variantColumns = getVariantPriceColumns(product.attributes);

        return {
          ID: product.id,
          Название: product.name,
          Slug: product.slug,
          Описание: product.description || '',
          Цена: product.price.toNumber(),
          ...variantColumns,
          'Старая цена': product.oldPrice?.toNumber() ?? '',
          Бренд: product.brand?.name || '',
          'Категория (основная)': primaryCategory?.title || '',
          Категории: allCategories,
          Изображения: images,
          Атрибуты: attributes,
          SKU: skus,
          'Остаток (сумма)': totalStock,
          Активен: product.isActive ? 'Да' : 'Нет',
          'На скидке': product.isOnSale ? 'Да' : 'Нет',
          Просмотры: product.viewCount,
          Продано: product.soldCount,
          Создан: this.formatExcelDate(product.createdAt),
          Обновлён: this.formatExcelDate(product.updatedAt),
        };
      });

      const maxVariantPairs = rows.reduce((max, row) => {
        const indexes = Object.keys(row)
          .map((key) => key.match(/^Симка\s+(\d+)$/)?.[1])
          .filter((value): value is string => Boolean(value))
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isFinite(value));
        return Math.max(max, ...indexes, 0);
      }, 0);
      const variantHeaders = Array.from(
        { length: maxVariantPairs },
        (_, index) => [`Симка ${index + 1}`, `Цена ${index + 1}`],
      ).flat();
      const headers = [
        'ID',
        'Название',
        'Slug',
        'Описание',
        'Цена',
        ...variantHeaders,
        'Старая цена',
        'Бренд',
        'Категория (основная)',
        'Категории',
        'Изображения',
        'Атрибуты',
        'SKU',
        'Остаток (сумма)',
        'Активен',
        'На скидке',
        'Просмотры',
        'Продано',
        'Создан',
        'Обновлён',
      ];

      const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
      worksheet['!cols'] = [
        { wch: 38 },
        { wch: 42 },
        { wch: 32 },
        { wch: 56 },
        { wch: 14 },
        ...variantHeaders.map((header) => ({
          wch: header.startsWith('Симка') ? 22 : 14,
        })),
        { wch: 14 },
        { wch: 20 },
        { wch: 30 },
        { wch: 44 },
        { wch: 60 },
        { wch: 60 },
        { wch: 28 },
        { wch: 16 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 22 },
        { wch: 22 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

      const fileBuffer = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      }) as Buffer;

      const productsFilePath = path.resolve(
        process.cwd(),
        'public',
        'products.xlsx',
      );

      try {
        await fs.mkdir(path.dirname(productsFilePath), { recursive: true });
        await fs.writeFile(productsFilePath, fileBuffer);
      } catch (error) {
        this.logger.warn(
          `Failed to update public/products.xlsx after export: ${error instanceof Error ? error.message : error}`,
        );
      }

      const exportedAt = new Date();
      const scope = [categoryId && 'category', brandId && 'brand']
        .filter(Boolean)
        .join('-');
      const fileName = `products-export${scope ? `-${scope}` : ''}-${this.formatExportDate(exportedAt)}.xlsx`;

      return {
        fileName,
        rowsCount: rows.length,
        buffer: fileBuffer,
      };
    } catch (error) {
      this.logger.error(
        `Error exporting products xlsx: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async importProductsXlsx(fileBuffer: Buffer, originalFileName: string) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Uploaded XLSX file is empty');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    } catch (error) {
      throw new BadRequestException(
        `Failed to read XLSX: ${error instanceof Error ? error.message : error}`,
      );
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException('XLSX file does not contain any sheets');
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, {
      defval: '',
      raw: false,
    });

    if (!rows.length) {
      throw new BadRequestException('XLSX file does not contain product rows');
    }

    const defaultPickupPoint = await this.prisma.pickupPoint.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const brandCache = new Map<string, string>();
    const categoryCache = new Map<string, string>();
    const summary: {
      fileName: string;
      sheetName: string;
      totalRows: number;
      processedRows: number;
      created: number;
      updated: number;
      skipped: number;
      errors: Array<{ row: number; reason: string }>;
    } = {
      fileName: originalFileName,
      sheetName: firstSheetName,
      totalRows: rows.length,
      processedRows: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    const importBatch = await this.prisma.productImportBatch.create({
      data: {
        fileName: originalFileName,
        totalRows: rows.length,
      },
      select: { id: true },
    });
    const undoContext: ImportUndoContext = {
      createdCategories: new Map<string, string>(),
      createdBrands: new Map<string, string>(),
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 2;

      if (this.isRowEmpty(row)) {
        summary.skipped += 1;
        continue;
      }

      try {
        const parsed = this.parseImportRow(row, rowNumber);

        const operation = await this.prisma.$transaction(async (tx) => {
          const existing = await this.findExistingProduct(
            tx,
            parsed.sourceId,
            parsed.sourceSlug,
          );
          const beforeSnapshot = existing
            ? await this.captureProductImportSnapshot(tx, existing.id)
            : null;
          const brandId = parsed.brandName
            ? await this.resolveBrandId(
                tx,
                parsed.brandName,
                brandCache,
                undoContext,
              )
            : null;

          const categoryIds = await this.resolveCategoryIds(
            tx,
            parsed.categoryNames,
            categoryCache,
            undoContext,
          );
          const fallbackCategoryIds =
            categoryIds.length > 0
              ? categoryIds
              : await this.resolveCategoryIds(
                  tx,
                  ['Без категории'],
                  categoryCache,
                  undoContext,
                );

          const baseSlug = parsed.sourceSlug || this.slugify(parsed.name);
          const productSlug = await this.ensureUniqueProductSlug(
            tx,
            baseSlug,
            existing?.id,
          );
          const normalizedIncomingAttributes = this.normalizeAttributes(
            parsed.attributes,
          );
          const images = parsed.images;
          const shouldBeOnSale =
            parsed.isOnSale ||
            (parsed.oldPrice !== null && parsed.oldPrice > parsed.price);

          if (existing) {
            const existingAttributes = await tx.productAttribute.findMany({
              where: { productId: existing.id },
              select: { name: true, value: true },
            });
            const attributes = this.mergeConfigurationAttributes(
              normalizedIncomingAttributes,
              existingAttributes,
            );
            const attributesWithVariantPrices =
              applyVariantPriceColumnsToAttributes(attributes, row);

            const updatedProduct = await tx.product.update({
              where: { id: existing.id },
              data: {
                brandId,
                name: parsed.name,
                slug: productSlug,
                description: parsed.description,
                price: parsed.price,
                oldPrice: parsed.oldPrice,
                isActive: parsed.isActive,
                isOnSale: shouldBeOnSale,
              },
              select: { id: true, updatedAt: true },
            });

            await tx.productCategory.deleteMany({
              where: { productId: existing.id },
            });
            await tx.productCategory.createMany({
              data: fallbackCategoryIds.map((categoryId, idx) => ({
                productId: existing.id,
                categoryId,
                isPrimary: idx === 0,
              })),
            });

            await tx.productImage.deleteMany({
              where: { productId: existing.id },
            });
            if (images.length > 0) {
              await tx.productImage.createMany({
                data: images.map((url, idx) => ({
                  productId: existing.id,
                  url,
                  sortOrder: idx,
                })),
              });
            }

            await tx.productAttribute.deleteMany({
              where: { productId: existing.id },
            });
            if (attributesWithVariantPrices.length > 0) {
              await tx.productAttribute.createMany({
                data: attributesWithVariantPrices.map((attribute) => ({
                  productId: existing.id,
                  name: attribute.name,
                  value: attribute.value,
                })),
              });
            }

            if (
              defaultPickupPoint &&
              (parsed.stockCount !== null || parsed.sku !== null)
            ) {
              await tx.productStock.upsert({
                where: {
                  productId_pointId: {
                    productId: existing.id,
                    pointId: defaultPickupPoint.id,
                  },
                },
                update: {
                  stockCount: parsed.stockCount ?? 0,
                  sku: parsed.sku || productSlug,
                },
                create: {
                  productId: existing.id,
                  pointId: defaultPickupPoint.id,
                  stockCount: parsed.stockCount ?? 0,
                  sku: parsed.sku || productSlug,
                },
              });
            }

            await tx.productImportEntry.upsert({
              where: {
                batchId_productId: {
                  batchId: importBatch.id,
                  productId: updatedProduct.id,
                },
              },
              create: {
                batchId: importBatch.id,
                productId: updatedProduct.id,
                action: 'UPDATED',
                beforeSnapshot: beforeSnapshot as any,
                afterUpdatedAt: updatedProduct.updatedAt,
              },
              update: {
                afterUpdatedAt: updatedProduct.updatedAt,
              },
            });

            return 'updated' as const;
          }

          const createdAttributes = applyVariantPriceColumnsToAttributes(
            normalizedIncomingAttributes,
            row,
          );

          const created = await tx.product.create({
            data: {
              brandId,
              name: parsed.name,
              slug: productSlug,
              description: parsed.description,
              price: parsed.price,
              oldPrice: parsed.oldPrice,
              isActive: parsed.isActive,
              isOnSale: shouldBeOnSale,
              categories: {
                create: fallbackCategoryIds.map((categoryId, idx) => ({
                  categoryId,
                  isPrimary: idx === 0,
                })),
              },
              images:
                images.length > 0
                  ? {
                      create: images.map((url, idx) => ({
                        url,
                        sortOrder: idx,
                      })),
                    }
                  : undefined,
              attributes:
                createdAttributes.length > 0
                  ? {
                      create: createdAttributes.map((attribute) => ({
                        name: attribute.name,
                        value: attribute.value,
                      })),
                    }
                  : undefined,
            },
            select: { id: true, updatedAt: true },
          });

          if (
            defaultPickupPoint &&
            (parsed.stockCount !== null || parsed.sku !== null)
          ) {
            await tx.productStock.create({
              data: {
                productId: created.id,
                pointId: defaultPickupPoint.id,
                stockCount: parsed.stockCount ?? 0,
                sku: parsed.sku || productSlug,
              },
            });
          }

          await tx.productImportEntry.upsert({
            where: {
              batchId_productId: {
                batchId: importBatch.id,
                productId: created.id,
              },
            },
            create: {
              batchId: importBatch.id,
              productId: created.id,
              action: 'CREATED',
              afterUpdatedAt: created.updatedAt,
            },
            update: {
              afterUpdatedAt: created.updatedAt,
            },
          });

          return 'created' as const;
        });

        summary.processedRows += 1;
        if (operation === 'created') {
          summary.created += 1;
        } else {
          summary.updated += 1;
        }
      } catch (error) {
        summary.skipped += 1;
        if (summary.errors.length < 50) {
          summary.errors.push({
            row: rowNumber,
            reason:
              error instanceof Error ? error.message : 'Unknown import error',
          });
        }
      }
    }

    const completedAt = new Date();
    await this.prisma.productImportBatch.update({
      where: { id: importBatch.id },
      data: {
        status: 'COMPLETED',
        processedRows: summary.processedRows,
        createdCount: summary.created,
        updatedCount: summary.updated,
        skippedCount: summary.skipped,
        summary: {
          sheetName: summary.sheetName,
          errors: summary.errors,
        } as any,
        createdCategories: this.toCreatedImportEntities(
          undoContext.createdCategories,
        ) as any,
        createdBrands: this.toCreatedImportEntities(
          undoContext.createdBrands,
        ) as any,
        completedAt,
      },
    });

    if (summary.processedRows > 0) {
      await Promise.all([
        this.categoryCacheService.invalidateAllCaches(),
        this.productCacheService.invalidateAllCaches(),
      ]);
    }

    try {
      const productsFilePath = path.resolve(
        process.cwd(),
        'public',
        'products.xlsx',
      );
      await fs.mkdir(path.dirname(productsFilePath), { recursive: true });
      await fs.writeFile(productsFilePath, fileBuffer);
    } catch (error) {
      this.logger.warn(
        `Failed to save imported XLSX snapshot: ${error instanceof Error ? error.message : error}`,
      );
    }

    return {
      ...summary,
      importBatchId: importBatch.id,
      undoAvailable: summary.processedRows > 0,
    };
  }

  async getProductsXlsxUndoStatus() {
    const batch = await this.prisma.productImportBatch.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
        completedAt: true,
        createdCount: true,
        updatedCount: true,
        skippedCount: true,
      },
    });

    if (!batch || batch.status !== 'COMPLETED' || !batch.completedAt) {
      return { undoAvailable: false, batch: null };
    }

    return {
      undoAvailable: true,
      batch: {
        id: batch.id,
        fileName: batch.fileName,
        createdAt: batch.createdAt,
        completedAt: batch.completedAt,
        createdCount: batch.createdCount,
        updatedCount: batch.updatedCount,
        skippedCount: batch.skippedCount,
      },
    };
  }

  async undoLatestProductsXlsxImport() {
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.productImportBatch.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { entries: true },
      });

      if (!batch || batch.status !== 'COMPLETED' || !batch.completedAt) {
        throw new BadRequestException(
          'Нет последней выгрузки, которую можно отменить',
        );
      }

      const productIds = batch.entries.map((entry) => entry.productId);
      const currentProducts = productIds.length
        ? await tx.product.findMany({
            where: { id: { in: productIds } },
            select: {
              id: true,
              updatedAt: true,
              _count: {
                select: {
                  orderItems: true,
                  reviews: true,
                  favorites: true,
                  relatedProducts: true,
                  relatedFromProducts: true,
                },
              },
            },
          })
        : [];
      const currentProductById = new Map(
        currentProducts.map((product) => [product.id, product]),
      );
      const conflictedProductIds: string[] = [];

      for (const entry of batch.entries) {
        const product = currentProductById.get(entry.productId);
        if (
          !product ||
          product.updatedAt.getTime() !== entry.afterUpdatedAt.getTime()
        ) {
          conflictedProductIds.push(entry.productId);
          continue;
        }

        if (
          entry.action === 'CREATED' &&
          (product._count.orderItems > 0 ||
            product._count.reviews > 0 ||
            product._count.favorites > 0 ||
            product._count.relatedProducts > 0 ||
            product._count.relatedFromProducts > 0)
        ) {
          conflictedProductIds.push(entry.productId);
        }
      }

      const conflictedProductIdSet = new Set(conflictedProductIds);

      let restored = 0;
      let removed = 0;

      for (const entry of batch.entries.filter(
        (item) =>
          item.action === 'UPDATED' &&
          !conflictedProductIdSet.has(item.productId),
      )) {
        const snapshot = this.parseProductImportSnapshot(entry.beforeSnapshot);
        if (!snapshot) {
          throw new ConflictException(
            'Для одной из позиций не найден снимок до выгрузки',
          );
        }

        await this.restoreProductImportSnapshot(tx, entry.productId, snapshot);
        restored += 1;
      }

      for (const entry of batch.entries.filter(
        (item) =>
          item.action === 'CREATED' &&
          !conflictedProductIdSet.has(item.productId),
      )) {
        await tx.product.delete({ where: { id: entry.productId } });
        removed += 1;
      }

      const removedCategories = await this.removeUntouchedImportCategories(
        tx,
        batch.createdCategories,
      );
      const removedBrands = await this.removeUntouchedImportBrands(
        tx,
        batch.createdBrands,
      );

      await tx.productImportBatch.update({
        where: { id: batch.id },
        data: {
          status:
            conflictedProductIds.length > 0 ? 'PARTIALLY_UNDONE' : 'UNDONE',
          undoneAt: new Date(),
        },
      });

      return {
        batchId: batch.id,
        restored,
        removed,
        removedCategories,
        removedBrands,
        skipped: conflictedProductIds.length,
        status: conflictedProductIds.length > 0 ? 'PARTIALLY_UNDONE' : 'UNDONE',
      };
    });

    await Promise.all([
      this.categoryCacheService.invalidateAllCaches(),
      this.productCacheService.invalidateAllCaches(),
    ]);
    this.logger.log(`Rolled back XLSX product import ${result.batchId}`);

    return result;
  }

  private async captureProductImportSnapshot(
    tx: PrismaTx,
    productId: string,
  ): Promise<ProductImportSnapshot> {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        brandId: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        oldPrice: true,
        isActive: true,
        isOnSale: true,
        categories: {
          select: { categoryId: true, isPrimary: true },
          orderBy: { createdAt: 'asc' },
        },
        images: {
          select: { url: true, alt: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
        attributes: {
          select: { name: true, value: true },
          orderBy: { createdAt: 'asc' },
        },
        productStock: {
          select: { pointId: true, sku: true, stockCount: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!product) {
      throw new BadRequestException('Товар для сохранения снимка не найден');
    }

    return {
      brandId: product.brandId,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price.toString(),
      oldPrice: product.oldPrice?.toString() ?? null,
      isActive: product.isActive,
      isOnSale: product.isOnSale,
      categories: product.categories,
      images: product.images,
      attributes: product.attributes,
      stocks: product.productStock,
    };
  }

  private async restoreProductImportSnapshot(
    tx: PrismaTx,
    productId: string,
    snapshot: ProductImportSnapshot,
  ) {
    await tx.product.update({
      where: { id: productId },
      data: {
        brandId: snapshot.brandId,
        name: snapshot.name,
        slug: snapshot.slug,
        description: snapshot.description,
        price: snapshot.price,
        oldPrice: snapshot.oldPrice,
        isActive: snapshot.isActive,
        isOnSale: snapshot.isOnSale,
      },
    });

    await Promise.all([
      tx.productCategory.deleteMany({ where: { productId } }),
      tx.productImage.deleteMany({ where: { productId } }),
      tx.productAttribute.deleteMany({ where: { productId } }),
      tx.productStock.deleteMany({ where: { productId } }),
    ]);

    if (snapshot.categories.length > 0) {
      await tx.productCategory.createMany({
        data: snapshot.categories.map((category) => ({
          productId,
          categoryId: category.categoryId,
          isPrimary: category.isPrimary,
        })),
      });
    }
    if (snapshot.images.length > 0) {
      await tx.productImage.createMany({
        data: snapshot.images.map((image) => ({ productId, ...image })),
      });
    }
    if (snapshot.attributes.length > 0) {
      await tx.productAttribute.createMany({
        data: snapshot.attributes.map((attribute) => ({
          productId,
          ...attribute,
        })),
      });
    }
    if (snapshot.stocks.length > 0) {
      await tx.productStock.createMany({
        data: snapshot.stocks.map((stock) => ({ productId, ...stock })),
      });
    }
  }

  private parseProductImportSnapshot(
    value: unknown,
  ): ProductImportSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const snapshot = value as ProductImportSnapshot;
    if (
      typeof snapshot.name !== 'string' ||
      typeof snapshot.slug !== 'string' ||
      typeof snapshot.price !== 'string' ||
      !Array.isArray(snapshot.categories) ||
      !Array.isArray(snapshot.images) ||
      !Array.isArray(snapshot.attributes) ||
      !Array.isArray(snapshot.stocks)
    ) {
      return null;
    }

    return snapshot;
  }

  private toCreatedImportEntities(
    entities: Map<string, string>,
  ): CreatedImportEntity[] {
    return Array.from(entities, ([id, updatedAt]) => ({ id, updatedAt }));
  }

  private async getExportCategoryIds(categoryId?: string): Promise<string[]> {
    if (!categoryId) return [];

    const categories = await this.prisma.category.findMany({
      where: { isDeleted: false },
      select: { id: true, parentId: true },
    });
    const childrenByParentId = new Map<string, string[]>();

    for (const category of categories) {
      if (!category.parentId) continue;

      const children = childrenByParentId.get(category.parentId) || [];
      children.push(category.id);
      childrenByParentId.set(category.parentId, children);
    }

    const ids = new Set<string>([categoryId]);
    const pending = [categoryId];
    while (pending.length > 0) {
      const parentId = pending.shift();
      if (!parentId) continue;

      for (const childId of childrenByParentId.get(parentId) || []) {
        if (ids.has(childId)) continue;
        ids.add(childId);
        pending.push(childId);
      }
    }

    return [...ids];
  }

  private parseCreatedImportEntities(value: unknown): CreatedImportEntity[] {
    if (!Array.isArray(value)) return [];

    return value.filter(
      (item): item is CreatedImportEntity =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as CreatedImportEntity).id === 'string' &&
        typeof (item as CreatedImportEntity).updatedAt === 'string',
    );
  }

  private async removeUntouchedImportCategories(tx: PrismaTx, value: unknown) {
    const created = this.parseCreatedImportEntities(value);
    if (created.length === 0) return 0;

    const updatedAtById = new Map(
      created.map((category) => [category.id, category.updatedAt]),
    );
    const categories = await tx.category.findMany({
      where: { id: { in: created.map((category) => category.id) } },
      select: {
        id: true,
        updatedAt: true,
        _count: { select: { products: true, children: true } },
      },
    });
    const removableIds = categories
      .filter(
        (category) =>
          category._count.products === 0 &&
          category._count.children === 0 &&
          category.updatedAt.toISOString() === updatedAtById.get(category.id),
      )
      .map((category) => category.id);

    if (removableIds.length > 0) {
      await tx.category.deleteMany({ where: { id: { in: removableIds } } });
    }

    return removableIds.length;
  }

  private async removeUntouchedImportBrands(tx: PrismaTx, value: unknown) {
    const created = this.parseCreatedImportEntities(value);
    if (created.length === 0) return 0;

    const updatedAtById = new Map(
      created.map((brand) => [brand.id, brand.updatedAt]),
    );
    const brands = await tx.brand.findMany({
      where: { id: { in: created.map((brand) => brand.id) } },
      select: {
        id: true,
        updatedAt: true,
        _count: { select: { products: true } },
      },
    });
    const removableIds = brands
      .filter(
        (brand) =>
          brand._count.products === 0 &&
          brand.updatedAt.toISOString() === updatedAtById.get(brand.id),
      )
      .map((brand) => brand.id);

    if (removableIds.length > 0) {
      await tx.brand.deleteMany({ where: { id: { in: removableIds } } });
    }

    return removableIds.length;
  }

  private parseImportRow(row: ImportRow, rowNumber: number): ParsedImportRow {
    const name = this.readString(row, ['Название', 'Name', 'Товар', 'Product']);
    if (!name) {
      throw new Error(`Row ${rowNumber}: product name is required`);
    }

    const firstVariantPrice = getFirstVariantPriceFromRow(row);
    const price =
      firstVariantPrice ?? this.readNumber(row, ['Цена', 'Price', 'Стоимость']);
    if (price === null) {
      throw new Error(`Row ${rowNumber}: invalid or empty price`);
    }

    const oldPrice = this.readNumber(row, [
      'Старая цена',
      'Старая_цена',
      'Old Price',
      'OldPrice',
    ]);
    const description = this.readString(row, ['Описание', 'Description']);
    const sourceIdRaw = this.readString(row, ['ID', 'Id', 'id']);
    const sourceSlug = this.readString(row, ['Slug', 'slug']);
    const brandName = this.readString(row, ['Бренд', 'Brand', 'Производитель']);
    const isActiveRaw = this.readBoolean(row, [
      'Активен',
      'isActive',
      'Активный',
    ]);
    const isOnSaleRaw = this.readBoolean(row, [
      'На скидке',
      'isOnSale',
      'Скидка',
    ]);
    const sku = this.readString(row, ['SKU', 'Артикул']);
    const stockCount = this.readNumber(row, [
      'Остаток (сумма)',
      'Остаток',
      'Stock',
      'Наличие',
    ]);

    return {
      rowNumber,
      sourceId: sourceIdRaw && this.isUuid(sourceIdRaw) ? sourceIdRaw : null,
      sourceSlug,
      name,
      description,
      price,
      oldPrice,
      isActive: isActiveRaw ?? true,
      isOnSale: isOnSaleRaw ?? false,
      brandName,
      categoryNames: this.extractCategoryNames(row),
      images: this.extractImages(row),
      attributes: this.extractAttributes(row),
      sku,
      stockCount,
    };
  }

  private async findExistingProduct(
    tx: PrismaTx,
    sourceId: string | null,
    sourceSlug: string | null,
  ) {
    if (sourceId) {
      const byId = await tx.product.findUnique({
        where: { id: sourceId },
        select: { id: true },
      });
      if (byId) return byId;
    }

    if (sourceSlug) {
      const bySlug = await tx.product.findUnique({
        where: { slug: sourceSlug },
        select: { id: true },
      });
      if (bySlug) return bySlug;
    }

    return null;
  }

  private async resolveBrandId(
    tx: PrismaTx,
    brandName: string,
    cache: Map<string, string>,
    undoContext?: ImportUndoContext,
  ): Promise<string> {
    const normalized = this.normalizeLookupKey(brandName);
    const cached = cache.get(normalized);
    if (cached) return cached;

    const existing = await tx.brand.findFirst({
      where: {
        isDeleted: false,
        name: { equals: brandName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) {
      cache.set(normalized, existing.id);
      return existing.id;
    }

    const slug = await this.ensureUniqueBrandSlug(tx, this.slugify(brandName));
    const created = await tx.brand.create({
      data: {
        name: brandName,
        slug,
        isActive: true,
      },
      select: { id: true, updatedAt: true },
    });
    undoContext?.createdBrands.set(created.id, created.updatedAt.toISOString());
    cache.set(normalized, created.id);
    return created.id;
  }

  private async resolveCategoryIds(
    tx: PrismaTx,
    categoryNames: string[],
    cache: Map<string, string>,
    undoContext?: ImportUndoContext,
  ): Promise<string[]> {
    const uniqueCategoryNames = Array.from(
      new Set(
        categoryNames
          .map((name) => this.cleanValue(name))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const resolvedIds: string[] = [];
    for (const categoryName of uniqueCategoryNames) {
      const normalized = this.normalizeLookupKey(categoryName);
      const cached = cache.get(normalized);
      if (cached) {
        resolvedIds.push(cached);
        continue;
      }

      const existing = await tx.category.findFirst({
        where: {
          isDeleted: false,
          title: { equals: categoryName, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (existing) {
        cache.set(normalized, existing.id);
        resolvedIds.push(existing.id);
        continue;
      }

      const slug = await this.ensureUniqueCategorySlug(
        tx,
        this.slugify(categoryName),
      );
      const created = await tx.category.create({
        data: {
          title: categoryName,
          slug,
          isActive: true,
        },
        select: { id: true, updatedAt: true },
      });
      undoContext?.createdCategories.set(
        created.id,
        created.updatedAt.toISOString(),
      );
      cache.set(normalized, created.id);
      resolvedIds.push(created.id);
    }

    return resolvedIds;
  }

  private async ensureUniqueProductSlug(
    tx: PrismaTx,
    value: string,
    excludeProductId?: string,
  ): Promise<string> {
    const base = this.slugify(value);
    let attempt = 1;
    let candidate = base;

    while (true) {
      const existing = await tx.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing || existing.id === excludeProductId) {
        return candidate;
      }
      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
  }

  private async ensureUniqueBrandSlug(tx: PrismaTx, value: string) {
    const base = this.slugify(value);
    let attempt = 1;
    let candidate = base;

    while (true) {
      const existing = await tx.brand.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
  }

  private async ensureUniqueCategorySlug(tx: PrismaTx, value: string) {
    const base = this.slugify(value);
    let attempt = 1;
    let candidate = base;

    while (true) {
      const existing = await tx.category.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
  }

  private extractCategoryNames(row: ImportRow): string[] {
    const names: string[] = [];
    const productName = this.readString(row, [
      'Название',
      'Name',
      'Товар',
      'Product',
    ]);
    const primary = this.readString(row, [
      'Категория (основная)',
      'Категория',
      'Category',
    ]);
    if (primary) names.push(primary);

    const grouped = this.readString(row, ['Категории', 'Categories']);
    let groupedParts: string[] = [];
    if (grouped) {
      groupedParts = grouped
        .split(/\r?\n|\|/)
        .flatMap((part) => part.split(/\s*>\s*|\s*\/\s*/))
        .map((part) => this.cleanValue(part))
        .filter((value): value is string => Boolean(value));
      names.push(...groupedParts);
    }

    const subcategory = this.readString(row, ['Подкатегория', 'Subcategory']);
    const section = this.readString(row, ['Раздел', 'Section']);
    if (subcategory) names.push(subcategory);
    if (section) names.push(section);

    const uniqueNames = Array.from(
      new Set(
        names
          .map((name) => this.cleanValue(name))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const sourcePath = this.readString(row, [
      'Путь источника',
      'Source Path',
      'SourcePath',
      'Категория источника',
    ]);
    const categoryPath = [...uniqueNames, ...groupedParts];
    const topCategory = primary || groupedParts[0] || null;
    const normalizedInput = {
      productName: productName || '',
      topCategory,
      subcategory: subcategory || groupedParts[1] || null,
      section: section || groupedParts[groupedParts.length - 1] || null,
      sourcePath,
      categoryPath,
      attributes: this.extractAttributes(row),
    };

    if (isAccessoryLikeProduct(normalizedInput)) {
      return normalizeCategoryNamesForImport(normalizedInput);
    }

    return uniqueNames;
  }

  private extractImages(row: ImportRow): string[] {
    const imagesValue = this.readString(row, ['Изображения', 'Images', 'Фото']);
    if (!imagesValue) return [];

    const urls = imagesValue
      .split(/\r?\n|,|;/)
      .map((part) => this.cleanValue(part))
      .filter((value): value is string => Boolean(value))
      .filter((value) => /^https?:\/\//i.test(value));

    return Array.from(new Set(urls));
  }

  private extractAttributes(
    row: ImportRow,
  ): Array<{ name: string; value: string }> {
    const result: Array<{ name: string; value: string }> = [];
    const attributeColumn = this.readString(row, [
      'Атрибуты',
      'Характеристики',
      'Attributes',
    ]);

    if (attributeColumn) {
      const lines = attributeColumn
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        const [namePart, ...valueParts] = line.split(':');
        const attrName = this.cleanValue(namePart);
        const attrValue = this.cleanValue(valueParts.join(':'));

        if (attrName && attrValue) {
          result.push({ name: attrName, value: attrValue });
        }
      }
    }

    const ignoredHeaders = new Set(
      [
        'ID',
        'Название',
        'Name',
        'Товар',
        'Slug',
        'Описание',
        'Description',
        'Цена',
        'Price',
        'Старая цена',
        'Old Price',
        'Бренд',
        'Brand',
        'Категория',
        'Категория (основная)',
        'Категории',
        'Подкатегория',
        'Раздел',
        'Категория источника',
        'Путь источника',
        'ID оффера',
        'Группа оффера',
        'Изображения',
        'Images',
        'SKU',
        'Артикул',
        'Остаток (сумма)',
        'Остаток',
        'Stock',
        'Наличие',
        'Активен',
        'isActive',
        'На скидке',
        'isOnSale',
        'Просмотры',
        'Продано',
        'Создан',
        'Обновлён',
        'Обновлен',
        'Атрибуты',
        'Характеристики',
      ].map((header) => this.normalizeHeaderKey(header)),
    );

    for (const [header, rawValue] of Object.entries(row)) {
      const normalizedHeader = this.normalizeHeaderKey(header);
      if (
        ignoredHeaders.has(normalizedHeader) ||
        /^симка\d+$/.test(normalizedHeader) ||
        /^цена\d+$/.test(normalizedHeader) ||
        normalizedHeader.startsWith('__empty')
      ) {
        continue;
      }

      const attrValue = this.cleanValue(rawValue);
      const attrName = this.normalizeImportAttributeName(header);
      if (!attrName || !attrValue) {
        continue;
      }

      result.push({ name: attrName, value: attrValue });
    }

    return result;
  }

  private normalizeAttributes(
    attributes: Array<{ name: string; value: string }>,
  ): Array<{ name: string; value: string }> {
    const unique = new Map<string, { name: string; value: string }>();
    for (const attribute of attributes) {
      const name = this.normalizeImportAttributeName(attribute.name);
      const value = this.cleanValue(attribute.value);
      if (!name || !value) continue;

      const key = this.normalizeLookupKey(`${name}::${value}`);
      if (!unique.has(key)) {
        unique.set(key, { name, value });
      }
    }
    return Array.from(unique.values());
  }

  private isConfigurationAttributeName(name: string): boolean {
    return CONFIGURATION_ATTRIBUTE_NAMES.has(this.normalizeLookupKey(name));
  }

  private mergeConfigurationAttributes(
    incoming: Array<{ name: string; value: string }>,
    existing: Array<{ name: string; value: string }>,
  ): Array<{ name: string; value: string }> {
    const hasIncomingConfigurations = incoming.some((attribute) =>
      this.isConfigurationAttributeName(attribute.name),
    );

    if (hasIncomingConfigurations) {
      return this.normalizeAttributes(incoming);
    }

    const existingConfigurations = existing.filter((attribute) =>
      this.isConfigurationAttributeName(attribute.name),
    );

    if (existingConfigurations.length === 0) {
      return this.normalizeAttributes(incoming);
    }

    return this.normalizeAttributes([...incoming, ...existingConfigurations]);
  }

  private readFirstValue(row: ImportRow, aliases: string[]) {
    const entries = Object.entries(row);

    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(row, alias)) {
        return row[alias];
      }
    }

    for (const alias of aliases) {
      const normalizedAlias = this.normalizeHeaderKey(alias);
      const match = entries.find(
        ([key]) => this.normalizeHeaderKey(key) === normalizedAlias,
      );
      if (match) return match[1];
    }

    return null;
  }

  private readString(row: ImportRow, aliases: string[]): string | null {
    return this.cleanValue(this.readFirstValue(row, aliases));
  }

  private readNumber(row: ImportRow, aliases: string[]): number | null {
    const value = this.readFirstValue(row, aliases);
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const normalized = this.cleanValue(value);
    if (!normalized) return null;

    let cleaned = normalized
      .replace(/\u00A0/g, '')
      .replace(/\s+/g, '')
      .replace(/₽|руб\.?/gi, '');

    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }

    cleaned = cleaned.replace(/[^\d.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;

    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private readBoolean(row: ImportRow, aliases: string[]): boolean | null {
    const value = this.readFirstValue(row, aliases);
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return value;

    const normalized = this.cleanValue(value)?.toLowerCase();
    if (!normalized) return null;

    const truthy = new Set(['1', 'true', 'yes', 'y', 'да', 'активен']);
    const falsy = new Set(['0', 'false', 'no', 'n', 'нет', 'неактивен']);

    if (truthy.has(normalized)) return true;
    if (falsy.has(normalized)) return false;
    return null;
  }

  private isRowEmpty(row: ImportRow): boolean {
    return Object.values(row).every((value) => this.cleanValue(value) === null);
  }

  private cleanValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).replace(/\r/g, '').trim();
    return normalized ? normalized : null;
  }

  private normalizeImportAttributeName(value: string): string | null {
    const cleanName = this.cleanValue(value);
    if (!cleanName) return null;

    const withoutPrefix = cleanName.replace(/^параметр\s*:\s*/i, '').trim();
    const finalName = withoutPrefix || cleanName;
    if (!finalName) return null;

    const normalizedKey = this.normalizeLookupKey(finalName);
    if (TECHNICAL_IMPORT_ATTRIBUTE_NAMES.has(normalizedKey)) {
      return null;
    }

    return finalName;
  }

  private normalizeHeaderKey(value: string): string {
    return value
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, '')
      .replace(/[()_]/g, '');
  }

  private normalizeLookupKey(value: string): string {
    return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private slugify(text: string): string {
    const translitMap: Record<string, string> = {
      а: 'a',
      б: 'b',
      в: 'v',
      г: 'g',
      д: 'd',
      е: 'e',
      ё: 'yo',
      ж: 'zh',
      з: 'z',
      и: 'i',
      й: 'y',
      к: 'k',
      л: 'l',
      м: 'm',
      н: 'n',
      о: 'o',
      п: 'p',
      р: 'r',
      с: 's',
      т: 't',
      у: 'u',
      ф: 'f',
      х: 'kh',
      ц: 'ts',
      ч: 'ch',
      ш: 'sh',
      щ: 'shch',
      ъ: '',
      ы: 'y',
      ь: '',
      э: 'e',
      ю: 'yu',
      я: 'ya',
    };

    const transliterated = text
      .toLowerCase()
      .split('')
      .map((char) => translitMap[char] ?? char)
      .join('');

    const slug = transliterated
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return slug || `product-${Date.now()}`;
  }

  private formatExcelDate(date: Date): string {
    const iso = date.toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
  }

  private formatExportDate(date: Date): string {
    const iso = date.toISOString();
    return `${iso.slice(0, 10)}_${iso.slice(11, 19).replace(/:/g, '-')}`;
  }

  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      PENDING: 'В обработке',
      PROCESSING: 'В обработке',
      CONFIRMED: 'Подтвержден',
      SHIPPED: 'Отправлен',
      DELIVERED: 'Доставлен',
      CANCELLED: 'Отменен',
      PICKUP_READY: 'Готов к выдаче',
      PICKED_UP: 'Получен',
    };
    return statusMap[status] || status;
  }

  private getStatusType(
    status: string,
  ): 'success' | 'warning' | 'info' | 'danger' {
    const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
      PENDING: 'warning',
      PROCESSING: 'warning',
      CONFIRMED: 'info',
      SHIPPED: 'info',
      DELIVERED: 'success',
      CANCELLED: 'danger',
      PICKUP_READY: 'info',
      PICKED_UP: 'success',
    };
    return typeMap[status] || 'info';
  }

  /**
   * Get analytics with comparison across different time periods
   */
  async getPeriodAnalytics(period: 'day' | 'week' | 'month' = 'month') {
    try {
      const { currentStart, previousStart, previousEnd } =
        this.getPeriodDates(period);

      const [
        currentRevenue,
        previousRevenue,
        currentOrders,
        previousOrders,
        currentUsers,
        previousUsers,
        currentAvgOrderValue,
        previousAvgOrderValue,
      ] = await Promise.all([
        // Current period revenue
        this.prisma.order.aggregate({
          where: {
            status: { in: ['DELIVERED', 'SHIPPED', 'PAYED'] },
            createdAt: { gte: currentStart },
          },
          _sum: { finalTotal: true },
        }),
        // Previous period revenue
        this.prisma.order.aggregate({
          where: {
            status: { in: ['DELIVERED', 'SHIPPED', 'PAYED'] },
            createdAt: { gte: previousStart, lt: previousEnd },
          },
          _sum: { finalTotal: true },
        }),
        // Current period orders
        this.prisma.order.count({
          where: { createdAt: { gte: currentStart } },
        }),
        // Previous period orders
        this.prisma.order.count({
          where: { createdAt: { gte: previousStart, lt: previousEnd } },
        }),
        // New users current period
        this.prisma.user.count({
          where: { createdAt: { gte: currentStart } },
        }),
        // New users previous period
        this.prisma.user.count({
          where: { createdAt: { gte: previousStart, lt: previousEnd } },
        }),
        // Average order value current period
        this.prisma.order.aggregate({
          where: { createdAt: { gte: currentStart } },
          _avg: { finalTotal: true },
        }),
        // Average order value previous period
        this.prisma.order.aggregate({
          where: { createdAt: { gte: previousStart, lt: previousEnd } },
          _avg: { finalTotal: true },
        }),
      ]);

      return {
        period,
        periodLabel: this.getPeriodLabel(period),
        revenue: {
          current: currentRevenue._sum.finalTotal?.toNumber() || 0,
          previous: previousRevenue._sum.finalTotal?.toNumber() || 0,
          change: this.calculatePercentageChange(
            currentRevenue._sum.finalTotal?.toNumber() || 0,
            previousRevenue._sum.finalTotal?.toNumber() || 0,
          ),
        },
        orders: {
          current: currentOrders,
          previous: previousOrders,
          change: this.calculatePercentageChange(currentOrders, previousOrders),
        },
        newUsers: {
          current: currentUsers,
          previous: previousUsers,
          change: this.calculatePercentageChange(currentUsers, previousUsers),
        },
        avgOrderValue: {
          current: currentAvgOrderValue._avg.finalTotal?.toNumber() || 0,
          previous: previousAvgOrderValue._avg.finalTotal?.toNumber() || 0,
          change: this.calculatePercentageChange(
            currentAvgOrderValue._avg.finalTotal?.toNumber() || 0,
            previousAvgOrderValue._avg.finalTotal?.toNumber() || 0,
          ),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting period analytics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get payment methods breakdown
   */
  async getPaymentMethodsAnalytics() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [paymentMethods, totalOrders] = await Promise.all([
        this.prisma.order.groupBy({
          by: ['paymentMethod'],
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
          _sum: { finalTotal: true },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);

      const methodLabels: Record<string, string> = {
        ROBOKASSA: 'Онлайн оплата (Robokassa)',
        CASH: 'Наличными при получении',
      };

      const methodColors: Record<string, string> = {
        ROBOKASSA: '#4F46E5',
        CASH: '#10B981',
      };

      return {
        breakdown: paymentMethods.map((pm) => ({
          method: pm.paymentMethod,
          label: methodLabels[pm.paymentMethod] || pm.paymentMethod,
          count: pm._count.id,
          revenue: pm._sum.finalTotal?.toNumber() || 0,
          percentage:
            totalOrders > 0
              ? Number(((pm._count.id / totalOrders) * 100).toFixed(1))
              : 0,
          color: methodColors[pm.paymentMethod] || '#6B7280',
        })),
        total: totalOrders,
        mostUsed:
          paymentMethods.length > 0
            ? paymentMethods.reduce((a, b) =>
                a._count.id > b._count.id ? a : b,
              ).paymentMethod
            : null,
      };
    } catch (error) {
      this.logger.error(
        `Error getting payment methods analytics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get order status distribution
   */
  async getOrderStatusAnalytics() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [statusDistribution, totalOrders] = await Promise.all([
        this.prisma.order.groupBy({
          by: ['status'],
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);

      const statusColors: Record<string, string> = {
        PENDING: '#F59E0B',
        PROCESSING: '#3B82F6',
        PAYED: '#8B5CF6',
        SHIPPED: '#06B6D4',
        DELIVERED: '#10B981',
        CANCELLED: '#EF4444',
      };

      return {
        distribution: statusDistribution.map((sd) => ({
          status: sd.status,
          label: this.mapStatus(sd.status),
          count: sd._count.id,
          percentage:
            totalOrders > 0
              ? Number(((sd._count.id / totalOrders) * 100).toFixed(1))
              : 0,
          color: statusColors[sd.status] || '#6B7280',
          type: this.getStatusType(sd.status),
        })),
        total: totalOrders,
      };
    } catch (error) {
      this.logger.error(
        `Error getting order status analytics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get delivery method distribution
   */
  async getDeliveryMethodsAnalytics() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [deliveryMethods, totalOrders] = await Promise.all([
        this.prisma.order.groupBy({
          by: ['deliveryMethod'],
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
          _sum: { finalTotal: true },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);

      const methodLabels: Record<string, string> = {
        PICKUP: 'Самовывоз',
        DELIVERY: 'Доставка',
      };

      const methodColors: Record<string, string> = {
        PICKUP: '#8B5CF6',
        DELIVERY: '#F59E0B',
      };

      return {
        breakdown: deliveryMethods.map((dm) => ({
          method: dm.deliveryMethod,
          label: methodLabels[dm.deliveryMethod] || dm.deliveryMethod,
          count: dm._count.id,
          revenue: dm._sum.finalTotal?.toNumber() || 0,
          percentage:
            totalOrders > 0
              ? Number(((dm._count.id / totalOrders) * 100).toFixed(1))
              : 0,
          color: methodColors[dm.deliveryMethod] || '#6B7280',
        })),
        total: totalOrders,
      };
    } catch (error) {
      this.logger.error(
        `Error getting delivery methods analytics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get revenue trend over time for charts
   */
  async getRevenueTrend(days: number = 30) {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      const orders = await this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate },
          status: { in: ['DELIVERED', 'SHIPPED', 'PAYED'] },
        },
        select: {
          createdAt: true,
          finalTotal: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Group by date
      const dailyRevenue = new Map<string, number>();
      const dailyOrders = new Map<string, number>();

      // Initialize all days with 0
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        dailyRevenue.set(dateKey, 0);
        dailyOrders.set(dateKey, 0);
      }

      // Aggregate orders by date
      orders.forEach((order) => {
        const dateKey = order.createdAt.toISOString().split('T')[0];
        dailyRevenue.set(
          dateKey,
          (dailyRevenue.get(dateKey) || 0) + order.finalTotal.toNumber(),
        );
        dailyOrders.set(dateKey, (dailyOrders.get(dateKey) || 0) + 1);
      });

      const trend = Array.from(dailyRevenue.entries()).map(
        ([date, revenue]) => ({
          date,
          revenue: Number(revenue.toFixed(2)),
          orders: dailyOrders.get(date) || 0,
        }),
      );

      const totalRevenue = trend.reduce((sum, day) => sum + day.revenue, 0);
      const totalOrders = trend.reduce((sum, day) => sum + day.orders, 0);
      const avgDailyRevenue = totalRevenue / days;
      const avgDailyOrders = totalOrders / days;

      return {
        trend,
        summary: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalOrders,
          avgDailyRevenue: Number(avgDailyRevenue.toFixed(2)),
          avgDailyOrders: Number(avgDailyOrders.toFixed(2)),
          peakDay: trend.reduce(
            (max, day) => (day.revenue > max.revenue ? day : max),
            trend[0],
          ),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting revenue trend: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get top selling products
   */
  async getTopProducts(limit: number = 10) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const topProducts = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            createdAt: { gte: thirtyDaysAgo },
            status: { notIn: ['CANCELLED'] },
          },
        },
        _sum: { quantity: true, price: true },
        _count: { id: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
      });

      const productIds = topProducts.map((p) => p.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          images: { take: 1, select: { url: true } },
        },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      return topProducts.map((tp, index) => {
        const product = productMap.get(tp.productId);
        return {
          rank: index + 1,
          productId: tp.productId,
          name: product?.name || 'Unknown',
          slug: product?.slug,
          image: product?.images[0]?.url,
          unitsSold: tp._sum.quantity || 0,
          revenue: tp._sum.price?.toNumber() || 0,
          ordersCount: tp._count.id,
        };
      });
    } catch (error) {
      this.logger.error(
        `Error getting top products: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get top categories by revenue
   */
  async getTopCategories(limit: number = 10) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get order items with product categories
      const orderItems = await this.prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: { gte: thirtyDaysAgo },
            status: { notIn: ['CANCELLED'] },
          },
        },
        select: {
          quantity: true,
          price: true,
          product: {
            select: {
              categories: {
                where: { isPrimary: true },
                select: {
                  category: {
                    select: { id: true, title: true, slug: true },
                  },
                },
                take: 1,
              },
            },
          },
        },
      });

      // Aggregate by category
      const categoryStats = new Map<
        string,
        { title: string; slug: string; revenue: number; units: number }
      >();

      orderItems.forEach((item) => {
        const primaryCategory = item.product.categories[0]?.category;
        if (primaryCategory) {
          const existing = categoryStats.get(primaryCategory.id) || {
            title: primaryCategory.title,
            slug: primaryCategory.slug,
            revenue: 0,
            units: 0,
          };
          existing.revenue += item.price.toNumber() * item.quantity;
          existing.units += item.quantity;
          categoryStats.set(primaryCategory.id, existing);
        }
      });

      const sortedCategories = Array.from(categoryStats.entries())
        .map(([id, stats]) => ({
          categoryId: id,
          ...stats,
          revenue: Number(stats.revenue.toFixed(2)),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);

      const totalRevenue = sortedCategories.reduce(
        (sum, cat) => sum + cat.revenue,
        0,
      );

      return sortedCategories.map((cat, index) => ({
        rank: index + 1,
        ...cat,
        percentage:
          totalRevenue > 0
            ? Number(((cat.revenue / totalRevenue) * 100).toFixed(1))
            : 0,
      }));
    } catch (error) {
      this.logger.error(
        `Error getting top categories: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get hourly order distribution for heatmap
   */
  async getOrderHeatmap() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const orders = await this.prisma.order.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      });

      // Initialize heatmap: 7 days x 24 hours
      const heatmap: number[][] = Array(7)
        .fill(null)
        .map(() => Array(24).fill(0));

      orders.forEach((order) => {
        const dayOfWeek = order.createdAt.getDay(); // 0 = Sunday
        const hour = order.createdAt.getHours();
        heatmap[dayOfWeek][hour]++;
      });

      const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

      return {
        data: heatmap.map((hours, dayIndex) => ({
          day: dayLabels[dayIndex],
          dayIndex,
          hours: hours.map((count, hourIndex) => ({
            hour: hourIndex,
            count,
          })),
        })),
        maxValue: Math.max(...heatmap.flat()),
        totalOrders: orders.length,
      };
    } catch (error) {
      this.logger.error(
        `Error getting order heatmap: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get comprehensive analytics overview
   */
  async getAnalyticsOverview() {
    try {
      const [
        periodDay,
        periodWeek,
        periodMonth,
        paymentMethods,
        orderStatus,
        deliveryMethods,
      ] = await Promise.all([
        this.getPeriodAnalytics('day'),
        this.getPeriodAnalytics('week'),
        this.getPeriodAnalytics('month'),
        this.getPaymentMethodsAnalytics(),
        this.getOrderStatusAnalytics(),
        this.getDeliveryMethodsAnalytics(),
      ]);

      return {
        comparisons: {
          day: periodDay,
          week: periodWeek,
          month: periodMonth,
        },
        paymentMethods,
        orderStatus,
        deliveryMethods,
      };
    } catch (error) {
      this.logger.error(
        `Error getting analytics overview: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private getPeriodDates(period: 'day' | 'week' | 'month') {
    const now = new Date();
    let currentStart: Date;
    let previousStart: Date;
    let previousEnd: Date;

    switch (period) {
      case 'day':
        currentStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        previousStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 1,
        );
        previousEnd = new Date(currentStart.getTime() - 1);
        break;
      case 'week':
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        currentStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - diffToMonday,
        );
        previousStart = new Date(
          currentStart.getFullYear(),
          currentStart.getMonth(),
          currentStart.getDate() - 7,
        );
        previousEnd = new Date(currentStart.getTime() - 1);
        break;
      case 'month':
      default:
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59,
        );
        break;
    }

    return { currentStart, previousStart, previousEnd };
  }

  private getPeriodLabel(period: 'day' | 'week' | 'month'): string {
    const labels: Record<string, string> = {
      day: 'Сегодня vs Вчера',
      week: 'Эта неделя vs Прошлая',
      month: 'Этот месяц vs Прошлый',
    };
    return labels[period];
  }

  /**
   * Get overview of all soft-deleted items for admin dashboard
   */
  async getDeletedItemsOverview() {
    try {
      const [
        inactiveCategories,
        inactiveBrands,
        inactiveProducts,
        inactiveCoupons,
        recentInactiveCategories,
        recentInactiveBrands,
        recentInactiveProducts,
        recentInactiveCoupons,
      ] = await Promise.all([
        this.prisma.category.count({ where: { isActive: false } }),
        this.prisma.brand.count({ where: { isActive: false } }),
        this.prisma.product.count({ where: { isActive: false } }),
        this.prisma.coupon.count({ where: { isActive: false } }),
        this.prisma.category.findMany({
          where: { isActive: false },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: { id: true, title: true, slug: true, updatedAt: true },
        }),
        this.prisma.brand.findMany({
          where: { isActive: false },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: { id: true, name: true, slug: true, updatedAt: true },
        }),
        this.prisma.product.findMany({
          where: { isActive: false },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            updatedAt: true,
          },
        }),
        this.prisma.coupon.findMany({
          where: { isActive: false },
          take: 5,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            code: true,
            type: true,
            value: true,
            updatedAt: true,
          },
        }),
      ]);

      return {
        counts: {
          categories: inactiveCategories,
          brands: inactiveBrands,
          products: inactiveProducts,
          coupons: inactiveCoupons,
          total:
            inactiveCategories +
            inactiveBrands +
            inactiveProducts +
            inactiveCoupons,
        },
        recent: {
          categories: recentInactiveCategories.map((item) => ({
            id: item.id,
            title: item.title,
            slug: item.slug,
            deletedAt: item.updatedAt,
          })),
          brands: recentInactiveBrands.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            deletedAt: item.updatedAt,
          })),
          products: recentInactiveProducts.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            price: item.price,
            deletedAt: item.updatedAt,
          })),
          coupons: recentInactiveCoupons.map((item) => ({
            id: item.id,
            code: item.code,
            type: item.type,
            value: item.value,
            deletedAt: item.updatedAt,
          })),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting deleted items overview: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
