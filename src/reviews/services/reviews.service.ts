import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { ReviewsCacheService } from './cache.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: ReviewsCacheService,
  ) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    productId?: string;
    isActive?: boolean;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    // Check cache first
    const cacheKey = this.cacheService.generateListCacheKey(params);
    const cached = await this.cacheService.getCachedReviews(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for reviews list: ${cacheKey}`);
      return cached;
    }

    const where: Prisma.ReviewWhereInput = {};

    if (params.productId) {
      where.productId = params.productId;
    }

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              images: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const result = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache the result
    await this.cacheService.cacheReviews(cacheKey, result);
    this.logger.log(`Cached reviews list: ${cacheKey}`);

    return result;
  }

  async findOne(id: string) {
    // Check cache first
    const cached = await this.cacheService.getCachedReview(id);
    if (cached) {
      this.logger.log(`Cache hit for review: ${id}`);
      return cached;
    }

    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            images: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Cache the result
    await this.cacheService.cacheReview(id, review);
    this.logger.log(`Cached review: ${id}`);

    return review;
  }

  async getStats() {
    // Check cache first
    const cached = await this.cacheService.getCachedStats();
    if (cached) {
      this.logger.log('Cache hit for reviews stats');
      return cached;
    }

    const [total, pending, approved, avgRatingResult] = await Promise.all([
      this.prisma.review.count(),
      this.prisma.review.count({ where: { isActive: false } }),
      this.prisma.review.count({ where: { isActive: true } }),
      this.prisma.review.aggregate({
        _avg: {
          rating: true,
        },
      }),
    ]);

    const result = {
      total,
      pending,
      approved,
      avgRating: avgRatingResult._avg.rating || 0,
    };

    // Cache the result
    await this.cacheService.cacheStats(result);
    this.logger.log('Cached reviews stats');

    return result;
  }

  async approve(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: { isActive: true },
    });

    // Invalidate caches
    await this.cacheService.invalidateReview(id);
    await this.cacheService.invalidateStats();
    this.logger.log(`Approved review: ${id}`);

    return updated;
  }

  async reject(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: { isActive: false },
    });

    // Invalidate caches
    await this.cacheService.invalidateReview(id);
    await this.cacheService.invalidateStats();
    this.logger.log(`Rejected review: ${id}`);

    return updated;
  }

  async remove(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.prisma.review.delete({ where: { id } });

    // Invalidate caches
    await this.cacheService.invalidateAllCaches();
    this.logger.log(`Deleted review: ${id}`);

    return { message: 'Review deleted successfully' };
  }
}
