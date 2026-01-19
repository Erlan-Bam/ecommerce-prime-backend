import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { ProductCacheService } from './services/cache.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductFilterDto,
  ProductSortBy,
} from './dto';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: ProductCacheService,
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9а-яё\s-]/gi, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  async create(dto: CreateProductDto) {
    try {
      this.logger.log(`Creating product: ${dto.name}`);

      const slug = this.generateSlug(dto.name);

      const product = await this.prisma.product.create({
        data: {
          brandId: dto.brandId,
          name: dto.name,
          slug,
          description: dto.description,
          price: dto.price,
          oldPrice: dto.oldPrice,
          isActive: dto.isActive ?? true,
          isOnSale: dto.isOnSale ?? false,
          categories: {
            create: dto.categoryIds.map((catId, idx) => ({
              categoryId: catId,
              isPrimary: idx === 0,
            })),
          },
          images: dto.images
            ? {
                create: dto.images.map((img, idx) => ({
                  url: img.url,
                  alt: img.alt,
                  sortOrder: img.sortOrder ?? idx,
                })),
              }
            : undefined,
          attributes: dto.attributes
            ? {
                create: dto.attributes.map((attr) => ({
                  name: attr.name,
                  value: attr.value,
                })),
              }
            : undefined,
        },
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
          brand: true,
          images: { orderBy: { sortOrder: 'asc' } },
          attributes: true,
          productStock: {
            include: {
              pickupPoint: { select: { id: true, address: true } },
            },
          },
        },
      });

      await this.invalidateProductCaches();
      this.logger.log(`Created product ${product.id}`);

      return product;
    } catch (error) {
      this.logger.error(
        `Error creating product: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(filter: ProductFilterDto) {
    try {
      this.logger.log(
        `Finding all products with filter: ${JSON.stringify(filter)}`,
      );

      const cacheKey = `products:${JSON.stringify(filter)}`;
      const cached = await this.cacheService.getCachedProducts(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit: ${cacheKey}`);
        return cached;
      }

      const { page = 1, limit = 20 } = filter;
      const skip = (page - 1) * limit;

      const where = await this.buildWhereClause(filter);
      const orderBy = this.buildOrderByClause(filter.sortBy);

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          include: {
            categories: {
              include: {
                category: { select: { id: true, title: true, slug: true } },
              },
              orderBy: { isPrimary: 'desc' },
            },
            brand: { select: { id: true, name: true, slug: true } },
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
            reviews: { select: { rating: true } },
            productStock: { select: { stockCount: true } },
          },
        }),
        this.prisma.product.count({ where }),
      ]);

      const productsWithRating = products.map((product) => {
        const ratings = product.reviews;
        const avgRating =
          ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
            : 0;
        const totalStock = product.productStock.reduce(
          (sum, s) => sum + s.stockCount,
          0,
        );
        const { reviews, productStock, ...rest } = product;
        return {
          ...rest,
          rating: Math.round(avgRating * 10) / 10,
          reviewCount: ratings.length,
          totalStock,
        };
      });

      const result = {
        data: productsWithRating,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };

      await this.cacheService.cacheProducts(cacheKey, result);
      this.logger.log(`Cached products result`);

      return result;
    } catch (error) {
      this.logger.error(
        `Error finding all products: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find products',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string) {
    try {
      this.logger.log(`Finding product: ${id}`);

      const cached = await this.cacheService.getCachedProduct(id);
      if (cached) {
        this.logger.log(`Cache hit for product ${id}`);
        return cached;
      }

      const product = await this.prisma.product.findUnique({
        where: { id },
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
          brand: true,
          images: { orderBy: { sortOrder: 'asc' } },
          attributes: true,
          reviews: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          productStock: {
            include: {
              pickupPoint: {
                select: {
                  id: true,
                  address: true,
                  coords: true,
                  workingSchedule: true,
                  url: true,
                },
              },
            },
          },
        },
      });

      if (!product) {
        throw new HttpException(
          `Product with ID ${id} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Update view count
      await this.prisma.product.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });

      const ratings = product.reviews;
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
          : 0;

      const totalStock = product.productStock.reduce(
        (sum, s) => sum + s.stockCount,
        0,
      );

      const result = {
        ...product,
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: ratings.length,
        totalStock,
      };

      await this.cacheService.cacheProduct(id, result);
      return result;
    } catch (error) {
      this.logger.error(
        `Error finding product ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findBySlug(slug: string) {
    try {
      this.logger.log(`Finding product by slug: ${slug}`);

      const product = await this.prisma.product.findUnique({
        where: { slug },
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
          brand: true,
          images: { orderBy: { sortOrder: 'asc' } },
          attributes: true,
          reviews: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          productStock: {
            include: {
              pickupPoint: {
                select: {
                  id: true,
                  address: true,
                  coords: true,
                  workingSchedule: true,
                  url: true,
                },
              },
            },
          },
        },
      });

      if (!product) {
        throw new HttpException(`Product not found`, HttpStatus.NOT_FOUND);
      }

      await this.prisma.product.update({
        where: { id: product.id },
        data: { viewCount: { increment: 1 } },
      });

      const ratings = product.reviews;
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
          : 0;

      const totalStock = product.productStock.reduce(
        (sum, s) => sum + s.stockCount,
        0,
      );

      return {
        ...product,
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: ratings.length,
        totalStock,
      };
    } catch (error) {
      this.logger.error(
        `Error finding product by slug ${slug}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find product by slug',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    try {
      this.logger.log(`Updating product: ${id}`);

      await this.findOne(id);

      const updateData: any = {
        ...(dto.brandId && { brand: { connect: { id: dto.brandId } } }),
        ...(dto.name && { name: dto.name, slug: this.generateSlug(dto.name) }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.oldPrice !== undefined && { oldPrice: dto.oldPrice }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isOnSale !== undefined && { isOnSale: dto.isOnSale }),
      };

      // Handle categories update (many-to-many)
      if (dto.categoryIds?.length) {
        await this.prisma.productCategory.deleteMany({ where: { productId: id } });
        await this.prisma.productCategory.createMany({
          data: dto.categoryIds.map((catId, idx) => ({
            productId: id,
            categoryId: catId,
            isPrimary: idx === 0,
          })),
        });
      }

      // Handle images update
      if (dto.images) {
        await this.prisma.productImage.deleteMany({ where: { productId: id } });
        await this.prisma.productImage.createMany({
          data: dto.images.map((img, idx) => ({
            productId: id,
            url: img.url,
            alt: img.alt,
            sortOrder: img.sortOrder ?? idx,
          })),
        });
      }

      // Handle attributes update
      if (dto.attributes) {
        await this.prisma.productAttribute.deleteMany({
          where: { productId: id },
        });
        await this.prisma.productAttribute.createMany({
          data: dto.attributes.map((attr) => ({
            productId: id,
            name: attr.name,
            value: attr.value,
          })),
        });
      }

      const product = await this.prisma.product.update({
        where: { id },
        data: updateData,
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
          brand: true,
          images: { orderBy: { sortOrder: 'asc' } },
          attributes: true,
          productStock: {
            include: {
              pickupPoint: { select: { id: true, address: true } },
            },
          },
        },
      });

      await this.invalidateProductCaches();
      await this.cacheService.invalidateProduct(id);

      this.logger.log(`Updated product ${id}`);

      return product;
    } catch (error) {
      this.logger.error(
        `Error updating product ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to update product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: string) {
    try {
      this.logger.log(`Removing product: ${id}`);

      await this.findOne(id);
      await this.prisma.product.delete({ where: { id } });
      await this.invalidateProductCaches();
      await this.cacheService.invalidateProduct(id);

      this.logger.log(`Removed product ${id}`);

      return { message: 'Product deleted successfully' };
    } catch (error) {
      this.logger.error(
        `Error removing product ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to remove product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getFilters(categoryId?: string) {
    try {
      this.logger.log(`Getting filters for category: ${categoryId || 'all'}`);

      const where: any = {
        isActive: true,
        ...(categoryId && {
          categories: {
            some: { categoryId },
          },
        }),
      };

      const [brands, priceRange, attributes] = await Promise.all([
        this.prisma.brand.findMany({
          where: {
            isActive: true,
            products: { some: where },
          },
          select: { id: true, name: true, slug: true },
        }),
        this.prisma.product.aggregate({
          where,
          _min: { price: true },
          _max: { price: true },
        }),
        this.prisma.productAttribute.groupBy({
          by: ['name', 'value'],
          where: { product: where },
          _count: true,
        }),
      ]);

      // Group attributes by name
      const groupedAttributes: Record<string, string[]> = {};
      attributes.forEach((attr) => {
        if (!groupedAttributes[attr.name]) {
          groupedAttributes[attr.name] = [];
        }
        if (!groupedAttributes[attr.name].includes(attr.value)) {
          groupedAttributes[attr.name].push(attr.value);
        }
      });

      return {
        brands,
        priceRange: {
          min: Number(priceRange._min.price) || 0,
          max: Number(priceRange._max.price) || 0,
        },
        attributes: groupedAttributes,
      };
    } catch (error) {
      this.logger.error(`Error getting filters: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get filters',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Recursively get all subcategory IDs for a given category
   */
  private async getAllSubcategoryIds(categoryId: string): Promise<string[]> {
    const result: string[] = [categoryId];

    const children = await this.prisma.category.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    });

    if (children.length > 0) {
      for (const child of children) {
        const childIds = await this.getAllSubcategoryIds(child.id);
        result.push(...childIds);
      }
    }

    return result;
  }

  private async buildWhereClause(filter: ProductFilterDto): Promise<any> {
    const where: any = {
      isActive: true,
    };

    if (filter.categoryId) {
      // Get all subcategory IDs recursively
      const categoryIds = await this.getAllSubcategoryIds(filter.categoryId);

      // Filter by parent category OR any of its subcategories using many-to-many
      where.categories = {
        some: {
          categoryId: categoryIds.length > 1 ? { in: categoryIds } : filter.categoryId,
        },
      };
    }

    if (filter.brandIds?.length) {
      where.brandId = { in: filter.brandIds };
    }

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      where.price = {};
      if (filter.minPrice !== undefined) {
        where.price.gte = filter.minPrice;
      }
      if (filter.maxPrice !== undefined) {
        where.price.lte = filter.maxPrice;
      }
    }

    if (filter.inStock) {
      where.productStock = {
        some: {
          stockCount: { gt: 0 },
        },
      };
    }

    if (filter.onSale) {
      where.isOnSale = true;
    }

    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        {
          productStock: {
            some: { sku: { contains: filter.search, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (filter.attributes) {
      try {
        const attrs = JSON.parse(filter.attributes);
        where.attributes = {
          some: {
            OR: Object.entries(attrs).map(([name, values]) => {
              // If values is an array, use 'in' operator
              if (Array.isArray(values)) {
                return {
                  name,
                  value: { in: values },
                };
              }
              // If single value, use direct comparison
              return {
                name,
                value: values as string,
              };
            }),
          },
        };
      } catch {
        // Ignore invalid JSON
      }
    }

    return where;
  }

  private buildOrderByClause(sortBy?: ProductSortBy): any {
    switch (sortBy) {
      case ProductSortBy.PRICE_ASC:
        return { price: 'asc' };
      case ProductSortBy.PRICE_DESC:
        return { price: 'desc' };
      case ProductSortBy.NEWEST:
        return { createdAt: 'desc' };
      case ProductSortBy.RATING:
        return { reviews: { _count: 'desc' } };
      case ProductSortBy.POPULARITY:
      default:
        return [{ soldCount: 'desc' }, { viewCount: 'desc' }];
    }
  }

  private async invalidateProductCaches() {
    await this.cacheService.invalidateAllCaches();
  }
}
