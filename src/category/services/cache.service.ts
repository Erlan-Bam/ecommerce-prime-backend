import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class CategoryCacheService {
  private readonly cacheLogger = new Logger(CategoryCacheService.name);
  private readonly CACHE_PREFIX = 'category';
  private readonly CACHE_TTL = 3600;

  constructor(private readonly redisService: RedisService) {}

  private getCacheKey(id?: string): string {
    return id ? `${this.CACHE_PREFIX}:${id}` : `${this.CACHE_PREFIX}:all`;
  }

  async getCachedCategory(id: string): Promise<any | null> {
    const key = this.getCacheKey(id);
    return await this.redisService.get(key);
  }

  async getCachedCategories(cacheKey: string): Promise<any | null> {
    return await this.redisService.get(cacheKey);
  }

  async cacheCategory(id: string, data: any): Promise<void> {
    const key = this.getCacheKey(id);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cacheCategories(cacheKey: string, data: any): Promise<void> {
    await this.redisService.set(cacheKey, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} category cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating category caches:', error);
    }
  }

  async invalidateCategory(id: string): Promise<void> {
    try {
      const key = this.getCacheKey(id);
      await this.redisService.remove(key);
      await this.redisService.clearByPattern(`${this.CACHE_PREFIX}:all:*`);
      this.cacheLogger.log(`Invalidated cache for category ${id}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for category ${id}:`,
        error,
      );
    }
  }
}
