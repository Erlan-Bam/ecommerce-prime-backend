import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { RedisService } from '../shared/services/redis.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductFilterDto,
  ProductSortBy,
} from './dto';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
    const slug = this.generateSlug(dto.name);

    const product = await this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        name: dto.name,
        slug,
        description: dto.description,
        price: dto.price,
        oldPrice: dto.oldPrice,
        sku: dto.sku,
        stock: dto.stock ?? 0,
        isActive: dto.isActive ?? true,
        isOnSale: dto.isOnSale ?? false,
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
        category: true,
        brand: true,
        images: { orderBy: { sortOrder: 'asc' } },
        attributes: true,
      },
    });

    await this.invalidateProductCaches();
    return product;
  }

  async findAll(filter: ProductFilterDto) {
    const cacheKey = `products:${JSON.stringify(filter)}`;
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit: ${cacheKey}`);
      return JSON.parse(cached as string);
    }

    const { page = 1, limit = 20 } = filter;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(filter);
    const orderBy = this.buildOrderByClause(filter.sortBy);

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          category: { select: { id: true, title: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          reviews: { select: { rating: true } },
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
      const { reviews, ...rest } = product;
      return {
        ...rest,
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: ratings.length,
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

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    return result;
  }

  async findOne(id: string) {
    const cacheKey = `product:${id}`;
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        images: { orderBy: { sortOrder: 'asc' } },
        attributes: true,
        reviews: {
          where: { isActive: true },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
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

    const result = {
      ...product,
      rating: Math.round(avgRating * 10) / 10,
      reviewCount: ratings.length,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    return result;
  }

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        brand: true,
        images: { orderBy: { sortOrder: 'asc' } },
        attributes: true,
        reviews: {
          where: { isActive: true },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product not found`);
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

    return {
      ...product,
      rating: Math.round(avgRating * 10) / 10,
      reviewCount: ratings.length,
    };
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    const updateData: any = {
      ...(dto.categoryId && { category: { connect: { id: dto.categoryId } } }),
      ...(dto.brandId && { brand: { connect: { id: dto.brandId } } }),
      ...(dto.name && { name: dto.name, slug: this.generateSlug(dto.name) }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.price !== undefined && { price: dto.price }),
      ...(dto.oldPrice !== undefined && { oldPrice: dto.oldPrice }),
      ...(dto.sku && { sku: dto.sku }),
      ...(dto.stock !== undefined && { stock: dto.stock }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      ...(dto.isOnSale !== undefined && { isOnSale: dto.isOnSale }),
    };

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
        category: true,
        brand: true,
        images: { orderBy: { sortOrder: 'asc' } },
        attributes: true,
      },
    });

    await this.invalidateProductCaches();
    await this.redis.remove(`product:${id}`);

    return product;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    await this.invalidateProductCaches();
    await this.redis.remove(`product:${id}`);
    return { message: 'Product deleted successfully' };
  }

  async getFilters(categoryId?: string) {
    const where: any = {
      isActive: true,
      ...(categoryId && { categoryId }),
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
  }

  private buildWhereClause(filter: ProductFilterDto): any {
    const where: any = {
      isActive: true,
    };

    if (filter.categoryId) {
      where.categoryId = filter.categoryId;
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
      where.stock = { gt: 0 };
    }

    if (filter.onSale) {
      where.isOnSale = true;
    }

    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { sku: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.attributes) {
      try {
        const attrs = JSON.parse(filter.attributes);
        where.attributes = {
          some: {
            OR: Object.entries(attrs).map(([name, value]) => ({
              name,
              value: value as string,
            })),
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
    await this.redis.clearByPattern('products:*');
  }
}
