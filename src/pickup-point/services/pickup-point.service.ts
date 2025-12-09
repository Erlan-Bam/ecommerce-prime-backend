import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import {
  CreatePickupPointDto,
  UpdatePickupPointDto,
  CreateProductStockDto,
  UpdateProductStockDto,
} from '../dto';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { PickupPointCacheService } from './cache.service';

@Injectable()
export class PickupPointService {
  private readonly logger = new Logger(PickupPointService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: PickupPointCacheService,
  ) {}

  async create(dto: CreatePickupPointDto) {
    try {
      this.logger.log(`Creating pickup point: ${dto.address}`);

      const pickupPoint = await this.prisma.pickupPoint.create({
        data: {
          address: dto.address,
          coords: dto.coords,
          workingSchedule: dto.workingSchedule,
          url: dto.url,
          isActive: dto.isActive ?? true,
        },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(
        `Created pickup point ${pickupPoint.id}, cache invalidated`,
      );

      return pickupPoint;
    } catch (error) {
      this.logger.error(
        `Error creating pickup point: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create pickup point',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(paginationDto: PaginationDto) {
    try {
      this.logger.log(
        `Finding all pickup points with pagination: ${JSON.stringify(paginationDto)}`,
      );

      const { page = 1, limit = 20 } = paginationDto;
      const skip = (page - 1) * limit;

      const cacheKey = `pickup-point:all:page:${page}:limit:${limit}`;

      const cached = await this.cacheService.getCachedPickupPoints(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit for ${cacheKey}`);
        return cached;
      }

      const [data, total] = await Promise.all([
        this.prisma.pickupPoint.findMany({
          where: { isActive: true },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { productStock: true } },
          },
        }),
        this.prisma.pickupPoint.count({ where: { isActive: true } }),
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

      await this.cacheService.cachePickupPoints(cacheKey, result);
      this.logger.log(`Cached result for ${cacheKey}`);

      return result;
    } catch (error) {
      this.logger.error(
        `Error finding all pickup points: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find pickup points',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string) {
    try {
      this.logger.log(`Finding pickup point: ${id}`);

      const cached = await this.cacheService.getCachedPickupPoint(id);
      if (cached) {
        this.logger.log(`Cache hit for pickup point ${id}`);
        return cached;
      }

      const pickupPoint = await this.prisma.pickupPoint.findUnique({
        where: { id },
        include: {
          productStock: {
            include: {
              product: {
                select: { id: true, name: true, slug: true, price: true },
              },
            },
          },
        },
      });

      if (!pickupPoint) {
        throw new NotFoundException(`Pickup point with ID ${id} not found`);
      }

      await this.cacheService.cachePickupPoint(id, pickupPoint);
      return pickupPoint;
    } catch (error) {
      this.logger.error(
        `Error finding pickup point ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find pickup point',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, dto: UpdatePickupPointDto) {
    try {
      this.logger.log(`Updating pickup point: ${id}`);

      await this.findOne(id);

      const pickupPoint = await this.prisma.pickupPoint.update({
        where: { id },
        data: {
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.coords !== undefined && { coords: dto.coords }),
          ...(dto.workingSchedule !== undefined && {
            workingSchedule: dto.workingSchedule,
          }),
          ...(dto.url !== undefined && { url: dto.url }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      await this.cacheService.invalidatePickupPoint(id);
      this.logger.log(`Updated pickup point ${id}, cache invalidated`);

      return pickupPoint;
    } catch (error) {
      this.logger.error(
        `Error updating pickup point ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to update pickup point',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: string) {
    try {
      this.logger.log(`Removing pickup point: ${id}`);

      await this.findOne(id);
      await this.prisma.pickupPoint.delete({ where: { id } });
      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Deleted pickup point ${id}`);
      return { message: 'Pickup point deleted successfully' };
    } catch (error) {
      this.logger.error(
        `Error removing pickup point ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to remove pickup point',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Product Stock management
  async createProductStock(dto: CreateProductStockDto) {
    try {
      this.logger.log(
        `Creating product stock for product ${dto.productId} at point ${dto.pointId}`,
      );

      // Check if product exists
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });
      if (!product) {
        throw new NotFoundException(
          `Product with ID ${dto.productId} not found`,
        );
      }

      // Check if pickup point exists
      const pickupPoint = await this.prisma.pickupPoint.findUnique({
        where: { id: dto.pointId },
      });
      if (!pickupPoint) {
        throw new NotFoundException(
          `Pickup point with ID ${dto.pointId} not found`,
        );
      }

      // Check for existing stock entry
      const existing = await this.prisma.productStock.findUnique({
        where: {
          productId_pointId: {
            productId: dto.productId,
            pointId: dto.pointId,
          },
        },
      });
      if (existing) {
        throw new ConflictException(
          'Stock entry already exists for this product and pickup point',
        );
      }

      const productStock = await this.prisma.productStock.create({
        data: {
          productId: dto.productId,
          pointId: dto.pointId,
          sku: dto.sku,
          stockCount: dto.stockCount ?? 0,
        },
        include: {
          product: { select: { id: true, name: true, slug: true } },
          pickupPoint: { select: { id: true, address: true } },
        },
      });

      await this.cacheService.invalidatePickupPoint(dto.pointId);
      this.logger.log(
        `Created product stock for product ${dto.productId} at point ${dto.pointId}`,
      );

      return productStock;
    } catch (error) {
      this.logger.error(
        `Error creating product stock: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create product stock',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateProductStock(
    productId: string,
    pointId: string,
    dto: UpdateProductStockDto,
  ) {
    try {
      this.logger.log(
        `Updating product stock for product ${productId} at point ${pointId}`,
      );

      const existing = await this.prisma.productStock.findUnique({
        where: {
          productId_pointId: { productId, pointId },
        },
      });

      if (!existing) {
        throw new NotFoundException('Stock entry not found');
      }

      const productStock = await this.prisma.productStock.update({
        where: {
          productId_pointId: { productId, pointId },
        },
        data: {
          ...(dto.sku !== undefined && { sku: dto.sku }),
          ...(dto.stockCount !== undefined && { stockCount: dto.stockCount }),
        },
        include: {
          product: { select: { id: true, name: true, slug: true } },
          pickupPoint: { select: { id: true, address: true } },
        },
      });

      await this.cacheService.invalidatePickupPoint(pointId);
      this.logger.log(
        `Updated product stock for product ${productId} at point ${pointId}`,
      );

      return productStock;
    } catch (error) {
      this.logger.error(
        `Error updating product stock: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to update product stock',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async removeProductStock(productId: string, pointId: string) {
    try {
      this.logger.log(
        `Removing product stock for product ${productId} at point ${pointId}`,
      );

      const existing = await this.prisma.productStock.findUnique({
        where: {
          productId_pointId: { productId, pointId },
        },
      });

      if (!existing) {
        throw new NotFoundException('Stock entry not found');
      }

      await this.prisma.productStock.delete({
        where: {
          productId_pointId: { productId, pointId },
        },
      });

      await this.cacheService.invalidatePickupPoint(pointId);
      this.logger.log(
        `Removed product stock for product ${productId} at point ${pointId}`,
      );

      return { message: 'Stock entry deleted successfully' };
    } catch (error) {
      this.logger.error(
        `Error removing product stock: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to remove product stock',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getProductStockByProduct(productId: string) {
    try {
      this.logger.log(`Getting product stock for product: ${productId}`);

      return this.prisma.productStock.findMany({
        where: { productId },
        include: {
          pickupPoint: {
            select: {
              id: true,
              address: true,
              coords: true,
              workingSchedule: true,
              url: true,
            },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Error getting product stock by product ${productId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get product stock by product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getProductStockByPoint(pointId: string) {
    try {
      this.logger.log(`Getting product stock for point: ${pointId}`);

      return this.prisma.productStock.findMany({
        where: { pointId },
        include: {
          product: {
            select: { id: true, name: true, slug: true, price: true },
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Error getting product stock by point ${pointId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get product stock by point',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getTotalStockForProduct(productId: string): Promise<number> {
    try {
      this.logger.log(`Getting total stock for product: ${productId}`);

      const result = await this.prisma.productStock.aggregate({
        where: { productId },
        _sum: { stockCount: true },
      });
      return result._sum.stockCount ?? 0;
    } catch (error) {
      this.logger.error(
        `Error getting total stock for product ${productId}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get total stock for product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
