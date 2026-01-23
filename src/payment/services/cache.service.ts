import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class PaymentCacheService {
  private readonly logger = new Logger(PaymentCacheService.name);
  private readonly CACHE_PREFIX = 'payment';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(private readonly redisService: RedisService) {}

  // Payment cache key generators
  private getPaymentCacheKey(paymentId: string): string {
    return `${this.CACHE_PREFIX}:${paymentId}`;
  }

  private getOrderPaymentCacheKey(orderId: number): string {
    return `${this.CACHE_PREFIX}:order:${orderId}`;
  }

  private getUserPaymentsCacheKey(userId: string): string {
    return `${this.CACHE_PREFIX}:user:${userId}`;
  }

  // Get cached payment by ID
  async getCachedPayment(paymentId: string): Promise<any | null> {
    const key = this.getPaymentCacheKey(paymentId);
    return await this.redisService.get(key);
  }

  // Get cached payment by order ID
  async getCachedOrderPayment(orderId: number): Promise<any | null> {
    const key = this.getOrderPaymentCacheKey(orderId);
    return await this.redisService.get(key);
  }

  // Get cached user payments
  async getCachedUserPayments(userId: string): Promise<any | null> {
    const key = this.getUserPaymentsCacheKey(userId);
    return await this.redisService.get(key);
  }

  // Cache payment by ID
  async cachePayment(paymentId: string, data: any): Promise<void> {
    const key = this.getPaymentCacheKey(paymentId);
    await this.redisService.set(key, data, this.CACHE_TTL);
    this.logger.debug(`Cached payment ${paymentId}`);
  }

  // Cache payment by order ID
  async cacheOrderPayment(orderId: number, data: any): Promise<void> {
    const key = this.getOrderPaymentCacheKey(orderId);
    await this.redisService.set(key, data, this.CACHE_TTL);
    this.logger.debug(`Cached payment for order ${orderId}`);
  }

  // Cache user payments
  async cacheUserPayments(userId: string, data: any): Promise<void> {
    const key = this.getUserPaymentsCacheKey(userId);
    await this.redisService.set(key, data, this.CACHE_TTL);
    this.logger.debug(`Cached payments for user ${userId}`);
  }

  // Invalidate payment cache by ID
  async invalidatePayment(paymentId: string): Promise<void> {
    try {
      const key = this.getPaymentCacheKey(paymentId);
      await this.redisService.remove(key);
      this.logger.log(`Invalidated cache for payment ${paymentId}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating cache for payment ${paymentId}:`,
        error,
      );
    }
  }

  // Invalidate payment cache by order ID
  async invalidateOrderPayment(orderId: number): Promise<void> {
    try {
      const key = this.getOrderPaymentCacheKey(orderId);
      await this.redisService.remove(key);
      this.logger.log(`Invalidated payment cache for order ${orderId}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating payment cache for order ${orderId}:`,
        error,
      );
    }
  }

  // Invalidate all payment caches for a user
  async invalidateUserPayments(userId: string): Promise<void> {
    try {
      const key = this.getUserPaymentsCacheKey(userId);
      await this.redisService.remove(key);
      this.logger.log(`Invalidated payment caches for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error invalidating payment caches for user ${userId}:`,
        error,
      );
    }
  }

  // Invalidate all related payment caches (payment, order, user)
  async invalidateAllRelated(
    paymentId: string,
    orderId: number,
    userId: string,
  ): Promise<void> {
    await Promise.all([
      this.invalidatePayment(paymentId),
      this.invalidateOrderPayment(orderId),
      this.invalidateUserPayments(userId),
    ]);
    this.logger.log(
      `Invalidated all payment caches for payment ${paymentId}, order ${orderId}, user ${userId}`,
    );
  }
}
