import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class OrderCacheService {
  private readonly cacheLogger = new Logger(OrderCacheService.name);
  private readonly CACHE_PREFIX = 'order';
  private readonly CART_PREFIX = 'cart';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(private readonly redisService: RedisService) {}

  // Cart cache methods
  private getCartCacheKey(userId: string): string {
    return `${this.CART_PREFIX}:${userId}`;
  }

  async getCachedCart(userId: string): Promise<any | null> {
    const key = this.getCartCacheKey(userId);
    return await this.redisService.get(key);
  }

  async cacheCart(userId: string, data: any): Promise<void> {
    const key = this.getCartCacheKey(userId);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async invalidateCart(userId: string): Promise<void> {
    try {
      const key = this.getCartCacheKey(userId);
      await this.redisService.remove(key);
      this.cacheLogger.log(`Invalidated cart cache for user ${userId}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cart cache for user ${userId}:`,
        error,
      );
    }
  }

  // Order cache methods
  private getOrderCacheKey(userId: string, orderId?: string): string {
    return orderId
      ? `${this.CACHE_PREFIX}:${userId}:${orderId}`
      : `${this.CACHE_PREFIX}:${userId}:all`;
  }

  async getCachedOrder(userId: string, orderId: string): Promise<any | null> {
    const key = this.getOrderCacheKey(userId, orderId);
    return await this.redisService.get(key);
  }

  async getCachedUserOrders(userId: string): Promise<any | null> {
    const key = this.getOrderCacheKey(userId);
    return await this.redisService.get(key);
  }

  async cacheOrder(userId: string, orderId: string, data: any): Promise<void> {
    const key = this.getOrderCacheKey(userId, orderId);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cacheUserOrders(userId: string, data: any): Promise<void> {
    const key = this.getOrderCacheKey(userId);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async invalidateOrder(userId: string, orderId: string): Promise<void> {
    try {
      const key = this.getOrderCacheKey(userId, orderId);
      await this.redisService.remove(key);
      this.cacheLogger.log(`Invalidated cache for order ${orderId}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for order ${orderId}:`,
        error,
      );
    }
  }

  async invalidateUserOrders(userId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:${userId}:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(
        `Invalidated ${cleared} order cache entries for user ${userId}`,
      );
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating order caches for user ${userId}:`,
        error,
      );
    }
  }
}
