import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class ReviewsCacheService {
  private readonly cacheLogger = new Logger(ReviewsCacheService.name);
  private readonly CACHE_PREFIX = 'reviews';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  private getCacheKey(id?: string): string {
    return id ? `${this.CACHE_PREFIX}:${id}` : `${this.CACHE_PREFIX}:all`;
  }

  async getCachedReview(id: string): Promise<any | null> {
    const key = this.getCacheKey(id);
    return await this.redisService.get(key);
  }

  async getCachedReviews(cacheKey: string): Promise<any | null> {
    return await this.redisService.get(cacheKey);
  }

  async getCachedStats(): Promise<any | null> {
    const key = `${this.CACHE_PREFIX}:stats`;
    return await this.redisService.get(key);
  }

  async cacheReview(id: string, data: any): Promise<void> {
    const key = this.getCacheKey(id);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cacheReviews(cacheKey: string, data: any): Promise<void> {
    await this.redisService.set(cacheKey, data, this.CACHE_TTL);
  }

  async cacheStats(data: any): Promise<void> {
    const key = `${this.CACHE_PREFIX}:stats`;
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} reviews cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating reviews caches:', error);
    }
  }

  async invalidateReview(id: string): Promise<void> {
    try {
      const key = this.getCacheKey(id);
      await this.redisService.remove(key);
      await this.redisService.clearByPattern(`${this.CACHE_PREFIX}:all:*`);
      await this.redisService.clearByPattern(`${this.CACHE_PREFIX}:stats`);
      this.cacheLogger.log(`Invalidated cache for review ${id}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for review ${id}:`,
        error,
      );
    }
  }

  async invalidateStats(): Promise<void> {
    try {
      await this.redisService.remove(`${this.CACHE_PREFIX}:stats`);
      this.cacheLogger.log('Invalidated reviews stats cache');
    } catch (error) {
      this.cacheLogger.error('Error invalidating reviews stats cache:', error);
    }
  }

  generateListCacheKey(params: {
    page?: number;
    limit?: number;
    productId?: string;
    isActive?: boolean;
  }): string {
    const parts = [this.CACHE_PREFIX, 'list'];
    if (params.page) parts.push(`page:${params.page}`);
    if (params.limit) parts.push(`limit:${params.limit}`);
    if (params.productId) parts.push(`product:${params.productId}`);
    if (params.isActive !== undefined) parts.push(`active:${params.isActive}`);
    return parts.join(':');
  }
}
