import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class BlogCacheService {
  private readonly cacheLogger = new Logger(BlogCacheService.name);
  private readonly CACHE_PREFIX = 'blog';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  private getCacheKey(identifier?: string): string {
    return identifier
      ? `${this.CACHE_PREFIX}:${identifier}`
      : `${this.CACHE_PREFIX}:all`;
  }

  async getCachedPost(slug: string): Promise<any | null> {
    const key = this.getCacheKey(`slug:${slug}`);
    return await this.redisService.get(key);
  }

  async getCachedPostById(id: string): Promise<any | null> {
    const key = this.getCacheKey(`id:${id}`);
    return await this.redisService.get(key);
  }

  async getCachedPosts(cacheKey: string): Promise<any | null> {
    return await this.redisService.get(cacheKey);
  }

  async cachePost(slug: string, data: any): Promise<void> {
    const key = this.getCacheKey(`slug:${slug}`);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cachePostById(id: string, data: any): Promise<void> {
    const key = this.getCacheKey(`id:${id}`);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cachePosts(cacheKey: string, data: any): Promise<void> {
    await this.redisService.set(cacheKey, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} blog cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating blog caches:', error);
    }
  }

  async invalidatePost(id: string, slug?: string): Promise<void> {
    try {
      // Invalidate by ID
      const idKey = this.getCacheKey(`id:${id}`);
      await this.redisService.remove(idKey);

      // Invalidate by slug if provided
      if (slug) {
        const slugKey = this.getCacheKey(`slug:${slug}`);
        await this.redisService.remove(slugKey);
      }

      // Invalidate list caches
      await this.redisService.clearByPattern(`${this.CACHE_PREFIX}:list:*`);

      this.cacheLogger.log(`Invalidated cache for blog post ${id}`);
    } catch (error) {
      this.cacheLogger.error(
        `Error invalidating cache for blog post ${id}:`,
        error,
      );
    }
  }
}
