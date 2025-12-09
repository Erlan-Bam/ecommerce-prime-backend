import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProductCacheService extends RedisService {
  private readonly cacheLogger = new Logger(ProductCacheService.name);
  private readonly CACHE_PREFIX = 'product';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(configService: ConfigService) {
    super(configService);
  }

  private getCacheKey(id?: string): string {
    return id ? `${this.CACHE_PREFIX}:${id}` : `${this.CACHE_PREFIX}:all`;
  }

  async getCachedProduct(id: string): Promise<any | null> {
    const key = this.getCacheKey(id);
    return await this.get(key);
  }

  async getCachedProducts(cacheKey: string): Promise<any | null> {
    return await this.get(cacheKey);
  }

  async cacheProduct(id: string, data: any): Promise<void> {
    const key = this.getCacheKey(id);
    await this.set(key, data, this.CACHE_TTL);
  }

  async cacheProducts(cacheKey: string, data: any): Promise<void> {
    await this.set(cacheKey, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}s:*`;
      const cleared = await this.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} product cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating product caches:', error);
    }
  }

  async invalidateProduct(id: string): Promise<void> {
    try {
      const key = this.getCacheKey(id);
      await this.remove(key);
      this.cacheLogger.log(`Invalidated cache for product ${id}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for product ${id}:`,
        error,
      );
    }
  }
}
