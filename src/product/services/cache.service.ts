import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class ProductCacheService {
  private readonly cacheLogger = new Logger(ProductCacheService.name);
  private readonly CACHE_PREFIX = 'product';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(private readonly redisService: RedisService) {}

  private getCacheKey(id?: string): string {
    return id ? `${this.CACHE_PREFIX}:${id}` : `${this.CACHE_PREFIX}:all`;
  }

  async getCachedProduct(id: string): Promise<any | null> {
    const key = this.getCacheKey(id);
    return await this.redisService.get(key);
  }

  async getCachedProducts(cacheKey: string): Promise<any | null> {
    return await this.redisService.get(cacheKey);
  }

  async cacheProduct(id: string, data: any): Promise<void> {
    const key = this.getCacheKey(id);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cacheProducts(cacheKey: string, data: any): Promise<void> {
    await this.redisService.set(cacheKey, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}s:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} product cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating product caches:', error);
    }
  }

  async invalidateProduct(id: string): Promise<void> {
    try {
      const key = this.getCacheKey(id);
      await this.redisService.remove(key);
      this.cacheLogger.log(`Invalidated cache for product ${id}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for product ${id}:`,
        error,
      );
    }
  }
}
