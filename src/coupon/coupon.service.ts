import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto';
import { PaginationDto } from '../shared/dto/pagination.dto';
import { CouponCacheService } from './services/cache.service';

@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CouponCacheService,
  ) {}

  async create(dto: CreateCouponDto) {
    try {
      this.logger.log(`Creating coupon: ${dto.code}`);

      const normalizedCode = dto.code.toUpperCase().trim();

      const existing = await this.prisma.coupon.findUnique({
        where: { code: normalizedCode },
      });

      if (existing) {
        throw new HttpException(
          'Coupon with this code already exists',
          HttpStatus.CONFLICT,
        );
      }

      // Validate dates
      const validFrom = new Date(dto.validFrom);
      const validTo = new Date(dto.validTo);

      if (validTo <= validFrom) {
        throw new HttpException(
          'validTo must be after validFrom',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate percentage value
      if (dto.type === 'PERCENTAGE' && dto.value > 100) {
        throw new HttpException(
          'Percentage value cannot exceed 100',
          HttpStatus.BAD_REQUEST,
        );
      }

      const coupon = await this.prisma.coupon.create({
        data: {
          code: normalizedCode,
          type: dto.type,
          value: dto.value,
          validFrom,
          validTo,
          usageLimit: dto.usageLimit ?? 0,
          isActive: dto.isActive ?? true,
        },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Created coupon ${coupon.id}, cache invalidated`);

      return coupon;
    } catch (error) {
      this.logger.error(`Error creating coupon: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create coupon',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(pagination: PaginationDto) {
    try {
      this.logger.log(
        `Finding all coupons with pagination: ${JSON.stringify(pagination)}`,
      );

      const { page = 1, limit = 20 } = pagination;
      const skip = (page - 1) * limit;

      const cacheKey = `coupon:all:page:${page}:limit:${limit}`;

      const cached = await this.cacheService.getCachedCoupons(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit for ${cacheKey}`);
        return cached;
      }

      const [data, total] = await Promise.all([
        this.prisma.coupon.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.coupon.count(),
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

      await this.cacheService.cacheCoupons(cacheKey, result);
      this.logger.log(`Cached ${cacheKey}`);

      return result;
    } catch (error) {
      this.logger.error(`Error finding coupons: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || 'Failed to fetch coupons',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findActive() {
    try {
      this.logger.log('Finding active coupons');

      const cacheKey = 'coupon:active';

      const cached = await this.cacheService.getCachedCoupons(cacheKey);
      if (cached) {
        this.logger.log('Cache hit for active coupons');
        return cached;
      }

      const now = new Date();

      const data = await this.prisma.coupon.findMany({
        where: {
          isActive: true,
          validFrom: { lte: now },
          validTo: { gte: now },
        },
        orderBy: { validTo: 'asc' },
      });

      // Filter out coupons that have exceeded their usage limit
      const filteredData = data.filter(
        (coupon) =>
          coupon.usageLimit === 0 || coupon.usageCount < coupon.usageLimit,
      );

      await this.cacheService.cacheCoupons(cacheKey, filteredData);
      this.logger.log(`Cached active coupons: ${filteredData.length}`);

      return filteredData;
    } catch (error) {
      this.logger.error(
        `Error finding active coupons: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        error.message || 'Failed to fetch active coupons',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string) {
    try {
      this.logger.log(`Finding coupon: ${id}`);

      const cached = await this.cacheService.getCachedCoupon(id);
      if (cached) {
        this.logger.log(`Cache hit for coupon ${id}`);
        return cached;
      }

      const coupon = await this.prisma.coupon.findUnique({
        where: { id },
      });

      if (!coupon) {
        throw new HttpException('Coupon not found', HttpStatus.NOT_FOUND);
      }

      await this.cacheService.cacheCoupon(id, coupon);
      this.logger.log(`Cached coupon ${id}`);

      return coupon;
    } catch (error) {
      this.logger.error(`Error finding coupon: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to fetch coupon',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findByCode(code: string) {
    try {
      const normalizedCode = code.toUpperCase().trim();
      this.logger.log(`Finding coupon by code: ${normalizedCode}`);

      const cached =
        await this.cacheService.getCachedCouponByCode(normalizedCode);
      if (cached) {
        this.logger.log(`Cache hit for coupon code ${normalizedCode}`);
        return cached;
      }

      const coupon = await this.prisma.coupon.findUnique({
        where: { code: normalizedCode },
      });

      if (!coupon) {
        throw new HttpException('Coupon not found', HttpStatus.NOT_FOUND);
      }

      await this.cacheService.cacheCouponByCode(normalizedCode, coupon);
      this.logger.log(`Cached coupon by code ${normalizedCode}`);

      return coupon;
    } catch (error) {
      this.logger.error(
        `Error finding coupon by code: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to fetch coupon',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async validateCoupon(code: string) {
    try {
      const normalizedCode = code.toUpperCase().trim();
      this.logger.log(`Validating coupon: ${normalizedCode}`);

      const coupon = await this.findByCode(normalizedCode);

      const now = new Date();

      if (!coupon.isActive) {
        throw new HttpException('Coupon is not active', HttpStatus.BAD_REQUEST);
      }

      if (now < new Date(coupon.validFrom)) {
        throw new HttpException(
          'Coupon is not yet valid',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (now > new Date(coupon.validTo)) {
        throw new HttpException('Coupon has expired', HttpStatus.BAD_REQUEST);
      }

      if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
        throw new HttpException(
          'Coupon usage limit reached',
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error validating coupon: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to validate coupon',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, dto: UpdateCouponDto) {
    try {
      this.logger.log(`Updating coupon: ${id}`);

      const existing = await this.prisma.coupon.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new HttpException('Coupon not found', HttpStatus.NOT_FOUND);
      }

      const updateData: any = {};

      if (dto.code !== undefined) {
        const normalizedCode = dto.code.toUpperCase().trim();
        const codeExists = await this.prisma.coupon.findFirst({
          where: { code: normalizedCode, id: { not: id } },
        });
        if (codeExists) {
          throw new HttpException(
            'Coupon with this code already exists',
            HttpStatus.CONFLICT,
          );
        }
        updateData.code = normalizedCode;
      }

      if (dto.type !== undefined) updateData.type = dto.type;
      if (dto.value !== undefined) {
        if (
          (dto.type === 'PERCENTAGE' || existing.type === 'PERCENTAGE') &&
          dto.value > 100
        ) {
          throw new HttpException(
            'Percentage value cannot exceed 100',
            HttpStatus.BAD_REQUEST,
          );
        }
        updateData.value = dto.value;
      }
      if (dto.validFrom !== undefined)
        updateData.validFrom = new Date(dto.validFrom);
      if (dto.validTo !== undefined) updateData.validTo = new Date(dto.validTo);
      if (dto.usageLimit !== undefined) updateData.usageLimit = dto.usageLimit;
      if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

      // Validate dates if both are being updated
      const validFrom = updateData.validFrom || existing.validFrom;
      const validTo = updateData.validTo || existing.validTo;
      if (validTo <= validFrom) {
        throw new HttpException(
          'validTo must be after validFrom',
          HttpStatus.BAD_REQUEST,
        );
      }

      const coupon = await this.prisma.coupon.update({
        where: { id },
        data: updateData,
      });

      await this.cacheService.invalidateCoupon(id, existing.code);
      if (updateData.code && updateData.code !== existing.code) {
        await this.cacheService.invalidateCoupon(id, updateData.code);
      }
      this.logger.log(`Updated coupon ${id}, cache invalidated`);

      return coupon;
    } catch (error) {
      this.logger.error(`Error updating coupon: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to update coupon',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: string) {
    try {
      this.logger.log(`Removing coupon: ${id}`);

      const existing = await this.prisma.coupon.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new HttpException('Coupon not found', HttpStatus.NOT_FOUND);
      }

      await this.prisma.coupon.delete({
        where: { id },
      });

      await this.cacheService.invalidateCoupon(id, existing.code);
      this.logger.log(`Removed coupon ${id}, cache invalidated`);

      return { message: 'Coupon deleted successfully' };
    } catch (error) {
      this.logger.error(`Error removing coupon: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to delete coupon',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async incrementUsage(id: string) {
    try {
      this.logger.log(`Incrementing usage for coupon: ${id}`);

      const coupon = await this.prisma.coupon.update({
        where: { id },
        data: { usageCount: { increment: 1 } },
      });

      await this.cacheService.invalidateCoupon(id, coupon.code);
      this.logger.log(`Incremented usage for coupon ${id}`);

      return coupon;
    } catch (error) {
      this.logger.error(
        `Error incrementing coupon usage: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        error.message || 'Failed to increment coupon usage',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
