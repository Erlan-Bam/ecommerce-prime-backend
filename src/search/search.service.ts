import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { SearchCacheService } from './services/cache.service';
import { SearchDto } from './dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: SearchCacheService,
  ) {}

  async autocomplete(dto: SearchDto) {
    try {
      this.logger.log(`Autocomplete search: ${dto.q}`);

      const { q, limit = 10 } = dto;

      if (!q || q.length < 2) {
        return { suggestions: [] };
      }

      const cached = await this.cacheService.getCachedAutocomplete(q, limit);
      if (cached) {
        this.logger.log(`Cache hit for autocomplete: ${q}`);
        return cached;
      }

      const [products, categories, brands] = await Promise.all([
        this.prisma.product.findMany({
          where: {
            isActive: true,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              {
                productStock: {
                  some: { sku: { contains: q, mode: 'insensitive' } },
                },
              },
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

      await this.cacheService.cacheAutocomplete(q, limit, result);
      this.logger.log(`Cached autocomplete result for: ${q}`);
      return result;
    } catch (error) {
      this.logger.error(`Error in autocomplete: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to perform autocomplete',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async search(dto: SearchDto) {
    try {
      this.logger.log(`Search query: ${dto.q}`);

      const { q, limit = 20 } = dto;

      if (!q || q.length < 2) {
        return { results: [], total: 0 };
      }

      const cached = await this.cacheService.getCachedSearch(q, limit);
      if (cached) {
        this.logger.log(`Cache hit for search: ${q}`);
        return cached;
      }

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where: {
            isActive: true,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              {
                productStock: {
                  some: { sku: { contains: q, mode: 'insensitive' } },
                },
              },
              { brand: { name: { contains: q, mode: 'insensitive' } } },
              { categories: { some: { category: { title: { contains: q, mode: 'insensitive' } } } } },
            ],
          },
          include: {
            categories: {
              include: {
                category: { select: { id: true, title: true, slug: true } },
              },
              orderBy: { isPrimary: 'desc' },
              take: 1,
            },
            brand: { select: { id: true, name: true, slug: true } },
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
            reviews: { select: { rating: true } },
            productStock: { select: { stockCount: true } },
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
              {
                productStock: {
                  some: { sku: { contains: q, mode: 'insensitive' } },
                },
              },
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
        const totalStock = product.productStock.reduce(
          (sum, s) => sum + s.stockCount,
          0,
        );
        const { reviews, productStock, categories, ...rest } = product;
        const primaryCategory = categories[0]?.category;
        return {
          ...rest,
          category: primaryCategory || null,
          rating: Math.round(avgRating * 10) / 10,
          reviewCount: ratings.length,
          totalStock,
        };
      });

      const result = { results, total };

      await this.cacheService.cacheSearch(q, limit, result);
      this.logger.log(`Cached search result for: ${q}`);
      return result;
    } catch (error) {
      this.logger.error(`Error in search: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to perform search',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getPopularSearches() {
    try {
      this.logger.log('Getting popular searches');

      const cacheKey = 'search:popular';
      const cached = await this.cacheService.get<any>(cacheKey);
      if (cached) {
        this.logger.log('Cache hit for popular searches');
        return cached;
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

      await this.cacheService.set(cacheKey, result, 3600); // 1 hour
      this.logger.log('Cached popular searches');
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting popular searches: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get popular searches',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
