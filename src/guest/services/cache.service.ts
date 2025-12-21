import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class GuestCacheService {
  private readonly cacheLogger = new Logger(GuestCacheService.name);
  private readonly CACHE_PREFIX = 'guest:cart';
  private readonly CACHE_TTL = 1800; // 30 minutes

  constructor(private readonly redisService: RedisService) {}

  private getCacheKey(sessionId: string): string {
    return `${this.CACHE_PREFIX}:${sessionId}`;
  }

  async getCachedCart(sessionId: string): Promise<any | null> {
    const key = this.getCacheKey(sessionId);
    return await this.redisService.get(key);
  }

  async cacheCart(sessionId: string, data: any): Promise<void> {
    const key = this.getCacheKey(sessionId);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async invalidateCart(sessionId: string): Promise<void> {
    try {
      const key = this.getCacheKey(sessionId);
      await this.redisService.remove(key);
      this.cacheLogger.log(`Invalidated cart cache for session ${sessionId}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cart cache for session ${sessionId}:`,
        error,
      );
    }
  }

  async invalidateAllGuestCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} guest cart cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating guest cart caches:', error);
    }
  }
}
