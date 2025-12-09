import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
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
    this.logger.log(`Created pickup point ${pickupPoint.id}, cache invalidated`);

    return pickupPoint;
  }

  async findAll(paginationDto: PaginationDto) {
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
  }

  async findOne(id: string) {
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
  }

  async update(id: string, dto: UpdatePickupPointDto) {
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
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.pickupPoint.delete({ where: { id } });
    await this.cacheService.invalidateAllCaches();
    this.logger.log(`Deleted pickup point ${id}`);
    return { message: 'Pickup point deleted successfully' };
  }

  // Product Stock management
  async createProductStock(dto: CreateProductStockDto) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${dto.productId} not found`);
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
    return productStock;
  }

  async updateProductStock(
    productId: string,
    pointId: string,
    dto: UpdateProductStockDto,
  ) {
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
    return productStock;
  }

  async removeProductStock(productId: string, pointId: string) {
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
    return { message: 'Stock entry deleted successfully' };
  }

  async getProductStockByProduct(productId: string) {
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
  }

  async getProductStockByPoint(pointId: string) {
    return this.prisma.productStock.findMany({
      where: { pointId },
      include: {
        product: {
          select: { id: true, name: true, slug: true, price: true },
        },
      },
    });
  }

  async getTotalStockForProduct(productId: string): Promise<number> {
    const result = await this.prisma.productStock.aggregate({
      where: { productId },
      _sum: { stockCount: true },
    });
    return result._sum.stockCount ?? 0;
  }
}
