import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { RedisService } from '../shared/services/redis.service';
import { SearchDto } from './dto';

@Injectable()
export class SearchService {
  private readonly CACHE_TTL = 600; // 10 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async autocomplete(dto: SearchDto) {
    const { q, limit = 10 } = dto;

    if (!q || q.length < 2) {
      return { suggestions: [] };
    }

    const cacheKey = `search:autocomplete:${q.toLowerCase()}:${limit}`;
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }

    const [products, categories, brands] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          images: { take: 1, select: { url: true } },
        },
        take: limit,
        orderBy: { soldCount: 'desc' },
      }),
      this.prisma.category.findMany({
        where: {
          isActive: true,
          title: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, title: true, slug: true },
        take: 5,
      }),
      this.prisma.brand.findMany({
        where: {
          isActive: true,
          name: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, name: true, slug: true },
        take: 5,
      }),
    ]);

    const result = {
      suggestions: {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: Number(p.price),
          image: p.images[0]?.url || null,
          type: 'product',
        })),
        categories: categories.map((c) => ({
          id: c.id,
          name: c.title,
          slug: c.slug,
          type: 'category',
        })),
        brands: brands.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          type: 'brand',
        })),
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    return result;
  }

  async search(dto: SearchDto) {
    const { q, limit = 20 } = dto;

    if (!q || q.length < 2) {
      return { results: [], total: 0 };
    }

    const cacheKey = `search:results:${q.toLowerCase()}:${limit}`;
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
            { brand: { name: { contains: q, mode: 'insensitive' } } },
            { category: { title: { contains: q, mode: 'insensitive' } } },
          ],
        },
        include: {
          category: { select: { id: true, title: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true } },
          images: { take: 1, orderBy: { sortOrder: 'asc' } },
          reviews: { select: { rating: true } },
        },
        take: limit,
        orderBy: [{ soldCount: 'desc' }, { viewCount: 'desc' }],
      }),
      this.prisma.product.count({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    const results = products.map((product) => {
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

    const result = { results, total };

    await this.redis.set(cacheKey, JSON.stringify(result), this.CACHE_TTL);
    return result;
  }

  async getPopularSearches() {
    const cacheKey = 'search:popular';
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) {
      return JSON.parse(cached as string);
    }

    // Get top products by views/sales as popular searches
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: [{ soldCount: 'desc' }, { viewCount: 'desc' }],
      take: 10,
    });

    const result = {
      popular: products.map((p) => p.name),
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 3600); // 1 hour
    return result;
  }
}
