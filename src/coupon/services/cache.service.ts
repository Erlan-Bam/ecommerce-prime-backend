import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CouponCacheService extends RedisService {
  private readonly cacheLogger = new Logger(CouponCacheService.name);
  private readonly CACHE_PREFIX = 'coupon';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(configService: ConfigService) {
    super(configService);
  }

  private getCacheKey(id?: string): string {
    return id ? `${this.CACHE_PREFIX}:${id}` : `${this.CACHE_PREFIX}:all`;
  }

  private getCodeCacheKey(code: string): string {
    return `${this.CACHE_PREFIX}:code:${code.toUpperCase()}`;
  }

  async getCachedCoupon(id: string): Promise<any | null> {
    const key = this.getCacheKey(id);
    return await this.get(key);
  }

  async getCachedCouponByCode(code: string): Promise<any | null> {
    const key = this.getCodeCacheKey(code);
    return await this.get(key);
  }

  async getCachedCoupons(cacheKey: string): Promise<any | null> {
    return await this.get(cacheKey);
  }

  async cacheCoupon(id: string, data: any): Promise<void> {
    const key = this.getCacheKey(id);
    await this.set(key, data, this.CACHE_TTL);
  }

  async cacheCouponByCode(code: string, data: any): Promise<void> {
    const key = this.getCodeCacheKey(code);
    await this.set(key, data, this.CACHE_TTL);
  }

  async cacheCoupons(cacheKey: string, data: any): Promise<void> {
    await this.set(cacheKey, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} coupon cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating coupon caches:', error);
    }
  }

  async invalidateCoupon(id: string, code?: string): Promise<void> {
    try {
      const key = this.getCacheKey(id);
      await this.remove(key);
      if (code) {
        await this.remove(this.getCodeCacheKey(code));
      }
      await this.clearByPattern(`${this.CACHE_PREFIX}:all:*`);
      await this.clearByPattern(`${this.CACHE_PREFIX}:active`);
      this.cacheLogger.log(`Invalidated cache for coupon ${id}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for coupon ${id}:`,
        error,
      );
    }
  }
}
