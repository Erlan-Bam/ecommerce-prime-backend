import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { SearchCacheService } from './services/cache.service';
import { SearchDto } from './dto';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly accessoryTerms = [
    'adapter',
    'case',
    'charger',
    'folio',
    'glass',
    'keyboard',
    'magsafe',
    'pen',
    'pencil',
    'protector',
    'stylus',
    'адаптер',
    'бампер',
    'защит',
    'кабел',
    'клавиатур',
    'магсейф',
    'накладк',
    'пленк',
    'ремеш',
    'стекл',
    'чех',
    'чехол',
  ];
  private readonly deviceIntentTerms = [
    'airpods',
    'beats',
    'dyson',
    'garmin',
    'honor',
    'ipad',
    'iphone',
    'macbook',
    'oneplus',
    'pixel',
    'samsung',
    'watch',
    'xiaomi',
    'айпад',
    'айфон',
    'макбук',
    'наушники',
    'планшет',
    'самсунг',
    'смартфон',
    'телефон',
    'часы',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: SearchCacheService,
  ) {}

  private normalizeText(value: unknown): string {
    return String(value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\\/g, ' ')
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getQueryTokens(query: string): string[] {
    return this.normalizeText(query)
      .split(' ')
      .map((token) => token.trim())
      .filter(Boolean);
  }

  private includesAny(text: string, terms: string[]): boolean {
    return terms.some((term) => text.includes(term));
  }

  private hasOrderedTokens(text: string, tokens: string[]): boolean {
    let position = -1;

    return tokens.every((token) => {
      const nextPosition = text.indexOf(token, position + 1);
      if (nextPosition === -1) return false;

      position = nextPosition;
      return true;
    });
  }

  private scoreProductForQuery(product: any, query: string): number {
    const normalizedQuery = this.normalizeText(query);
    const tokens = this.getQueryTokens(query);
    const name = this.normalizeText(product.name);
    const description = this.normalizeText(product.description);
    const brand = this.normalizeText(product.brand?.name);
    const categories = this.normalizeText(
      product.categories
        ?.map((item) => item.category?.title || item.title)
        .filter(Boolean)
        .join(' '),
    );
    const sku = this.normalizeText(
      product.productStock
        ?.map((stock) => stock.sku)
        .filter(Boolean)
        .join(' '),
    );

    let score = 0;

    if (name === normalizedQuery) score += 1200;
    if (name.startsWith(normalizedQuery)) score += 900;
    if (name.includes(normalizedQuery)) score += 700;
    if (sku.includes(normalizedQuery)) score += 650;

    if (tokens.length > 0 && tokens.every((token) => name.includes(token))) {
      score += 500;
    }
    if (tokens.length > 1 && this.hasOrderedTokens(name, tokens)) {
      score += 120;
    }

    tokens.forEach((token) => {
      if (name.includes(token)) score += 90;
      if (sku.includes(token)) score += 80;
      if (brand.includes(token)) score += 35;
      if (categories.includes(token)) score += 18;
      if (description.includes(token)) score += 8;
    });

    const hasDeviceIntent =
      this.includesAny(normalizedQuery, this.deviceIntentTerms) ||
      tokens.some((token) => /^\d{1,2}$/.test(token));
    const hasAccessoryIntent = this.includesAny(
      normalizedQuery,
      this.accessoryTerms,
    );
    const isAccessory = this.includesAny(name, this.accessoryTerms);

    if (hasDeviceIntent && !hasAccessoryIntent && isAccessory) {
      score -= 900;
    }
    if (hasAccessoryIntent && isAccessory) {
      score += 120;
    }

    score += Math.min(Number(product.soldCount || 0), 50) * 0.3;
    score += Math.min(Number(product.viewCount || 0), 100) * 0.05;

    return score;
  }

  private sortProductsByRelevance<T>(products: T[], query: string): T[] {
    return [...products].sort((a: any, b: any) => {
      const scoreDiff =
        this.scoreProductForQuery(b, query) -
        this.scoreProductForQuery(a, query);
      if (scoreDiff !== 0) return scoreDiff;

      return this.normalizeText(a.name).localeCompare(
        this.normalizeText(b.name),
        'ru',
      );
    });
  }

  private buildProductSearchConditions(
    query: string,
    options: { includeDescription: boolean; includeRelations: boolean },
  ): any[] {
    const conditions: any[] = [
      { name: { contains: query, mode: 'insensitive' as const } },
      {
        productStock: {
          some: { sku: { contains: query, mode: 'insensitive' as const } },
        },
      },
    ];

    if (options.includeDescription) {
      conditions.push({
        description: { contains: query, mode: 'insensitive' as const },
      });
    }

    if (options.includeRelations) {
      conditions.push(
        { brand: { name: { contains: query, mode: 'insensitive' as const } } },
        {
          categories: {
            some: {
              category: {
                title: { contains: query, mode: 'insensitive' as const },
              },
            },
          },
        },
      );
    }

    return conditions;
  }

  private buildTokenFallbackCondition(
    tokens: string[],
    options: { includeDescription: boolean; includeRelations: boolean },
  ): any | null {
    if (tokens.length < 2) return null;

    return {
      AND: tokens.map((token) => ({
        OR: this.buildProductSearchConditions(token, options),
      })),
    };
  }

  async autocomplete(dto: SearchDto) {
    try {
      this.logger.log(`Autocomplete search: ${dto.q}`);

      const { limit = 10 } = dto;
      const q = dto.q?.trim() || '';

      if (q.length < 1) {
        return { suggestions: [] };
      }

      const cached = await this.cacheService.getCachedAutocomplete(q, limit);
      if (cached) {
        this.logger.log(`Cache hit for autocomplete: ${q}`);
        return cached;
      }

      const candidateLimit = Math.min(Math.max(limit * 8, 80), 200);
      const tokens = this.getQueryTokens(q);
      const autocompleteProductOr = this.buildProductSearchConditions(q, {
        includeDescription: false,
        includeRelations: false,
      });
      const autocompleteTokenFallback = this.buildTokenFallbackCondition(
        tokens,
        {
          includeDescription: false,
          includeRelations: false,
        },
      );
      if (autocompleteTokenFallback) {
        autocompleteProductOr.push(autocompleteTokenFallback);
      }

      const [products, categories, brands] = await Promise.all([
        this.prisma.product.findMany({
          where: {
            isActive: true,
            isDeleted: false,
            OR: autocompleteProductOr,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            images: { take: 1, select: { url: true } },
          },
          take: candidateLimit,
          orderBy: { soldCount: 'desc' },
        }),
        this.prisma.category.findMany({
          where: {
            isActive: true,
            isDeleted: false,
            title: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, title: true, slug: true },
          take: 5,
        }),
        this.prisma.brand.findMany({
          where: {
            isActive: true,
            isDeleted: false,
            name: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, name: true, slug: true },
          take: 5,
        }),
      ]);

      const result = {
        suggestions: {
          products: this.sortProductsByRelevance(products, q)
            .slice(0, limit)
            .map((p) => ({
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

      const { limit = 20 } = dto;
      const q = dto.q?.trim() || '';

      if (q.length < 1) {
        return { results: [], total: 0 };
      }

      const cached = await this.cacheService.getCachedSearch(q, limit);
      if (cached) {
        this.logger.log(`Cache hit for search: ${q}`);
        return cached;
      }

      const candidateLimit = Math.min(Math.max(limit * 8, 80), 240);
      const tokens = this.getQueryTokens(q);
      const productSearchOr = this.buildProductSearchConditions(q, {
        includeDescription: true,
        includeRelations: true,
      });
      const tokenFallback = this.buildTokenFallbackCondition(tokens, {
        includeDescription: true,
        includeRelations: true,
      });
      if (tokenFallback) {
        productSearchOr.push(tokenFallback);
      }
      const productWhere = {
        isActive: true,
        isDeleted: false,
        OR: productSearchOr,
      };

      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where: productWhere,
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
            productStock: { select: { stockCount: true, sku: true } },
          },
          take: candidateLimit,
          orderBy: [{ soldCount: 'desc' }, { viewCount: 'desc' }],
        }),
        this.prisma.product.count({
          where: productWhere,
        }),
      ]);

      const results = this.sortProductsByRelevance(products, q)
        .slice(0, limit)
        .map((product) => {
          const ratings = product.reviews;
          const avgRating =
            ratings.length > 0
              ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
              : 0;
          const totalStock = product.productStock.reduce(
            (sum, s) => sum + s.stockCount,
            0,
          );
          const rest: Record<string, any> = { ...product };
          delete rest.reviews;
          delete rest.productStock;
          const categories = rest.categories;
          delete rest.categories;
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
        where: { isActive: true, isDeleted: false },
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
