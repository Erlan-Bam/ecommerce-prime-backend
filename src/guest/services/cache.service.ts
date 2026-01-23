import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class GuestCacheService {
  private readonly cacheLogger = new Logger(GuestCacheService.name);
  private readonly CART_PREFIX = 'guest:cart';
  private readonly ORDER_PREFIX = 'guest:order';
  private readonly CACHE_TTL = 1800; // 30 minutes

  constructor(private readonly redisService: RedisService) {}

  // Cart cache methods
  private getCartCacheKey(sessionId: string): string {
    return `${this.CART_PREFIX}:${sessionId}`;
  }

  async getCachedCart(sessionId: string): Promise<any | null> {
    const key = this.getCartCacheKey(sessionId);
    return await this.redisService.get(key);
  }

  async cacheCart(sessionId: string, data: any): Promise<void> {
    const key = this.getCartCacheKey(sessionId);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async invalidateCart(sessionId: string): Promise<void> {
    try {
      const key = this.getCartCacheKey(sessionId);
      await this.redisService.remove(key);
      this.cacheLogger.log(`Invalidated cart cache for session ${sessionId}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cart cache for session ${sessionId}:`,
        error,
      );
    }
  }

  // Order cache methods
  private getOrderCacheKey(sessionId: string, orderId?: number): string {
    return orderId
      ? `${this.ORDER_PREFIX}:${sessionId}:${orderId}`
      : `${this.ORDER_PREFIX}:${sessionId}:all`;
  }

  async getCachedGuestOrder(
    sessionId: string,
    orderId: number,
  ): Promise<any | null> {
    const key = this.getOrderCacheKey(sessionId, orderId);
    return await this.redisService.get(key);
  }

  async getCachedGuestOrders(sessionId: string): Promise<any | null> {
    const key = this.getOrderCacheKey(sessionId);
    return await this.redisService.get(key);
  }

  async cacheGuestOrder(
    sessionId: string,
    orderId: number,
    data: any,
  ): Promise<void> {
    const key = this.getOrderCacheKey(sessionId, orderId);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cacheGuestOrders(sessionId: string, data: any): Promise<void> {
    const key = this.getOrderCacheKey(sessionId);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async invalidateGuestOrder(sessionId: string, orderId: number): Promise<void> {
    try {
      const key = this.getOrderCacheKey(sessionId, orderId);
      await this.redisService.remove(key);
      this.cacheLogger.log(`Invalidated cache for guest order ${orderId}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for guest order ${orderId}:`,
        error,
      );
    }
  }

  async invalidateGuestOrders(sessionId: string): Promise<void> {
    try {
      const pattern = `${this.ORDER_PREFIX}:${sessionId}:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(
        `Invalidated ${cleared} order cache entries for session ${sessionId}`,
      );
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating order caches for session ${sessionId}:`,
        error,
      );
    }
  }

  async invalidateAllGuestCaches(): Promise<void> {
    try {
      const cartPattern = `${this.CART_PREFIX}:*`;
      const orderPattern = `${this.ORDER_PREFIX}:*`;
      const clearedCart = await this.redisService.clearByPattern(cartPattern);
      const clearedOrder = await this.redisService.clearByPattern(orderPattern);
      this.cacheLogger.log(
        `Invalidated ${clearedCart} guest cart and ${clearedOrder} guest order cache entries`,
      );
    } catch (error) {
      this.cacheLogger.error('Error invalidating guest caches:', error);
    }
  }
}
