import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';

@Injectable()
export class SearchCacheService {
  private readonly cacheLogger = new Logger(SearchCacheService.name);
  private readonly CACHE_PREFIX = 'search';
  private readonly CACHE_TTL = 600; // 10 minutes

  constructor(private readonly redisService: RedisService) {}

  private getCacheKey(type: string, query: string, limit: number): string {
    return `${this.CACHE_PREFIX}:${type}:${query.toLowerCase()}:${limit}`;
  }

  async getCachedAutocomplete(
    query: string,
    limit: number,
  ): Promise<any | null> {
    const key = this.getCacheKey('autocomplete', query, limit);
    return await this.redisService.get(key);
  }

  async getCachedSearch(query: string, limit: number): Promise<any | null> {
    const key = this.getCacheKey('search', query, limit);
    return await this.redisService.get(key);
  }

  async cacheAutocomplete(
    query: string,
    limit: number,
    data: any,
  ): Promise<void> {
    const key = this.getCacheKey('autocomplete', query, limit);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async cacheSearch(query: string, limit: number, data: any): Promise<void> {
    const key = this.getCacheKey('search', query, limit);
    await this.redisService.set(key, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.redisService.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} search cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating search caches:', error);
    }
  }
}
