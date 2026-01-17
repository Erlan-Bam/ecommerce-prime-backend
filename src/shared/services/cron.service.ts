import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/shared/services/prisma.service';
import { RedisService } from './redis.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  // Cache TTLs (in seconds)
  private readonly CACHE_TTL = {
    categories: 3600, // 1 hour
    brands: 3600, // 1 hour
    pickupPoints: 3600, // 1 hour
    blog: 1800, // 30 minutes
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Warm cache for frequently accessed data every 30 minutes
   * This ensures fresh data is always available in cache
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async warmCaches() {
    this.logger.log('Starting cache warming cycle...');

    try {
      await Promise.all([
        this.warmCategoryCache(),
        this.warmBrandCache(),
        this.warmPickupPointCache(),
        this.warmBlogCache(),
      ]);

      this.logger.log('Cache warming cycle completed successfully');
    } catch (error) {
      this.logger.error('Error during cache warming cycle:', error);
    }
  }

  /**
   * Warm category cache - tree structure and paginated list
   */
  private async warmCategoryCache() {
    try {
      this.logger.log('Warming category cache...');

      // Clear existing category cache
      await this.redisService.clearByPattern('category:*');

      // Cache category tree (most commonly accessed)
      const categoryTree = await this.prisma.category.findMany({
        where: { isActive: true, parentId: null },
        include: {
          children: {
            where: { isActive: true },
            include: {
              children: {
                where: { isActive: true },
                orderBy: { sortOrder: 'asc' },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { products: true } },
        },
        orderBy: { sortOrder: 'asc' },
      });

      await this.redisService.set(
        'category:tree',
        categoryTree,
        this.CACHE_TTL.categories,
      );

      // Cache first page of categories (common initial load)
      const [categories, total] = await Promise.all([
        this.prisma.category.findMany({
          where: { isActive: true },
          take: 10,
          include: {
            parent: { select: { id: true, title: true, slug: true } },
            children: {
              where: { isActive: true },
              select: { id: true, title: true, slug: true, image: true },
              orderBy: { sortOrder: 'asc' },
            },
            _count: { select: { products: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        }),
        this.prisma.category.count({ where: { isActive: true } }),
      ]);

      await this.redisService.set(
        'category:all:page:1:limit:10',
        {
          data: categories,
          meta: {
            total,
            page: 1,
            limit: 10,
            totalPages: Math.ceil(total / 10),
          },
        },
        this.CACHE_TTL.categories,
      );

      this.logger.log(
        `Category cache warmed: ${categoryTree.length} root categories, ${categories.length} paginated`,
      );
    } catch (error) {
      this.logger.error('Error warming category cache:', error);
    }
  }

  /**
   * Warm brand cache - active brands and paginated list
   */
  private async warmBrandCache() {
    try {
      this.logger.log('Warming brand cache...');

      // Clear existing brand cache
      await this.redisService.clearByPattern('brand:*');

      // Cache active brands (commonly used for filters)
      const activeBrands = await this.prisma.brand.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, logo: true },
      });

      await this.redisService.set(
        'brand:active',
        activeBrands,
        this.CACHE_TTL.brands,
      );

      // Cache first page of brands
      const [brands, total] = await Promise.all([
        this.prisma.brand.findMany({
          take: 20,
          orderBy: { name: 'asc' },
          include: { _count: { select: { products: true } } },
        }),
        this.prisma.brand.count(),
      ]);

      await this.redisService.set(
        'brand:all:page:1:limit:20',
        {
          data: brands,
          meta: {
            total,
            page: 1,
            limit: 20,
            totalPages: Math.ceil(total / 20),
          },
        },
        this.CACHE_TTL.brands,
      );

      this.logger.log(
        `Brand cache warmed: ${activeBrands.length} active, ${brands.length} paginated`,
      );
    } catch (error) {
      this.logger.error('Error warming brand cache:', error);
    }
  }

  /**
   * Warm pickup point cache
   */
  private async warmPickupPointCache() {
    try {
      this.logger.log('Warming pickup point cache...');

      // Clear existing pickup point cache
      await this.redisService.clearByPattern('pickup-point:*');

      // Cache first page of active pickup points
      const [pickupPoints, total] = await Promise.all([
        this.prisma.pickupPoint.findMany({
          where: { isActive: true },
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { productStock: true } },
          },
        }),
        this.prisma.pickupPoint.count({ where: { isActive: true } }),
      ]);

      await this.redisService.set(
        'pickup-point:all:page:1:limit:20',
        {
          data: pickupPoints,
          meta: {
            total,
            page: 1,
            limit: 20,
            totalPages: Math.ceil(total / 20),
          },
        },
        this.CACHE_TTL.pickupPoints,
      );

      this.logger.log(
        `Pickup point cache warmed: ${pickupPoints.length} points`,
      );
    } catch (error) {
      this.logger.error('Error warming pickup point cache:', error);
    }
  }

  /**
   * Warm blog cache - active posts paginated list
   */
  private async warmBlogCache() {
    try {
      this.logger.log('Warming blog cache...');

      // Clear existing blog cache
      await this.redisService.clearByPattern('blog:*');

      // Cache first page of active blog posts (most commonly accessed)
      const [posts, total] = await Promise.all([
        this.prisma.blog.findMany({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            text: true,
            slug: true,
            excerpt: true,
            imageUrl: true,
            author: true,
            readTime: true,
            tags: true,
            meta: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.blog.count({ where: { isActive: true } }),
      ]);

      await this.redisService.set(
        'blog:list:active:1:10',
        {
          data: posts,
          meta: {
            total,
            page: 1,
            limit: 10,
            totalPages: Math.ceil(total / 10),
          },
        },
        this.CACHE_TTL.blog,
      );

      // Also cache individual posts by slug for quick access
      for (const post of posts) {
        await this.redisService.set(
          `blog:slug:${post.slug}`,
          post,
          this.CACHE_TTL.blog,
        );
      }

      this.logger.log(`Blog cache warmed: ${posts.length} posts`);
    } catch (error) {
      this.logger.error('Error warming blog cache:', error);
    }
  }

  /**
   * Manual cache refresh - can be called via admin endpoint if needed
   */
  async refreshAllCaches() {
    this.logger.log('Manual cache refresh triggered');
    await this.warmCaches();
  }
}
