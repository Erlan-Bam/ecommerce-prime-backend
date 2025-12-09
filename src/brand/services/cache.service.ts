import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BrandCacheService extends RedisService {
  private readonly cacheLogger = new Logger(BrandCacheService.name);
  private readonly CACHE_PREFIX = 'brand';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(configService: ConfigService) {
    super(configService);
  }

  private getCacheKey(id?: string): string {
    return id ? `${this.CACHE_PREFIX}:${id}` : `${this.CACHE_PREFIX}:all`;
  }

  async getCachedBrand(id: string): Promise<any | null> {
    const key = this.getCacheKey(id);
    return await this.get(key);
  }

  async getCachedBrands(cacheKey: string): Promise<any | null> {
    return await this.get(cacheKey);
  }

  async cacheBrand(id: string, data: any): Promise<void> {
    const key = this.getCacheKey(id);
    await this.set(key, data, this.CACHE_TTL);
  }

  async cacheBrands(cacheKey: string, data: any): Promise<void> {
    await this.set(cacheKey, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} brand cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating brand caches:', error);
    }
  }

  async invalidateBrand(id: string): Promise<void> {
    try {
      const key = this.getCacheKey(id);
      await this.remove(key);
      await this.clearByPattern(`${this.CACHE_PREFIX}:all:*`);
      await this.clearByPattern(`${this.CACHE_PREFIX}:active`);
      this.cacheLogger.log(`Invalidated cache for brand ${id}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for brand ${id}:`,
        error,
      );
    }
  }
}
