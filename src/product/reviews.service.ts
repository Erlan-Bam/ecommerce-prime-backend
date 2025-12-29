import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    productId?: string;
    isActive?: boolean;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

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
              title: true,
              images: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
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
            title: true,
            images: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  async getStats() {
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

    return {
      total,
      pending,
      approved,
      avgRating: avgRatingResult._avg.rating || 0,
    };
  }

  async approve(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.prisma.review.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async reject(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.prisma.review.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async remove(id: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.prisma.review.delete({ where: { id } });

    return { message: 'Review deleted successfully' };
  }
}
