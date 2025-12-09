import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/services/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SearchCacheService extends RedisService {
  private readonly cacheLogger = new Logger(SearchCacheService.name);
  private readonly CACHE_PREFIX = 'search';
  private readonly CACHE_TTL = 600; // 10 minutes

  constructor(configService: ConfigService) {
    super(configService);
  }

  private getCacheKey(type: string, query: string, limit: number): string {
    return `${this.CACHE_PREFIX}:${type}:${query.toLowerCase()}:${limit}`;
  }

  async getCachedAutocomplete(
    query: string,
    limit: number,
  ): Promise<any | null> {
    const key = this.getCacheKey('autocomplete', query, limit);
    return await this.get(key);
  }

  async getCachedSearch(query: string, limit: number): Promise<any | null> {
    const key = this.getCacheKey('search', query, limit);
    return await this.get(key);
  }

  async cacheAutocomplete(
    query: string,
    limit: number,
    data: any,
  ): Promise<void> {
    const key = this.getCacheKey('autocomplete', query, limit);
    await this.set(key, data, this.CACHE_TTL);
  }

  async cacheSearch(query: string, limit: number, data: any): Promise<void> {
    const key = this.getCacheKey('search', query, limit);
    await this.set(key, data, this.CACHE_TTL);
  }

  async invalidateAllCaches(): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}:*`;
      const cleared = await this.clearByPattern(pattern);
      this.cacheLogger.log(`Invalidated ${cleared} search cache entries`);
    } catch (error) {
      this.cacheLogger.error('Error invalidating search caches:', error);
    }
  }
}
