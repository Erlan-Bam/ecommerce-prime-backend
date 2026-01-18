import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class PickupWindowCacheService {
  private readonly cacheLogger = new Logger(PickupWindowCacheService.name);
  private readonly CACHE_PREFIX = 'pickup-window';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  private getCacheKey(id?: string): string {
    return id ? `${this.CACHE_PREFIX}:${id}` : `${this.CACHE_PREFIX}:all`;
  }

  async getCachedPickupWindow(id: string): Promise<any | null> {
    const key = this.getCacheKey(id);
    return await this.redisService.get(key);
  }

  async getCachedPickupWindows(cacheKey: string): Promise<any | null> {
    return await this.redisService.get(cacheKey);
  }

  async cachePickupWindow(id: string, data: any): Promise<void> {
    const key = this.getCacheKey(id);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cachePickupWindows(cacheKey: string, data: any): Promise<void> {
    await this.redisService.set(cacheKey, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} pickup-window cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating pickup-window caches:', error);
    }
  }

  async invalidatePickupWindow(id: string): Promise<void> {
    try {
      const key = this.getCacheKey(id);
      await this.redisService.remove(key);
      await this.redisService.clearByPattern(`${this.CACHE_PREFIX}:all:*`);
      this.cacheLogger.log(`Invalidated cache for pickup-window ${id}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for pickup-window ${id}:`,
        error,
      );
    }
  }

  async invalidateByPointId(pointId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*point:${pointId}*`;
      await this.redisService.clearByPattern(pattern);
      await this.redisService.clearByPattern(`${this.CACHE_PREFIX}:all:*`);
      this.cacheLogger.log(`Invalidated cache for pickup-windows of point ${pointId}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for pickup-windows of point ${pointId}:`,
        error,
      );
    }
  }
}
