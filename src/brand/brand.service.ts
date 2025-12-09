import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { CreateBrandDto, UpdateBrandDto } from './dto';
import { PaginationDto } from '../shared/dto/pagination.dto';
import { BrandCacheService } from './services/cache.service';

@Injectable()
export class BrandService {
  private readonly logger = new Logger(BrandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: BrandCacheService,
  ) {}

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9а-яё\s-]/gi, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  async create(dto: CreateBrandDto) {
    try {
      this.logger.log(`Creating brand: ${dto.name}`);
      
      const slug = this.generateSlug(dto.name);

      const existing = await this.prisma.brand.findFirst({
        where: { OR: [{ name: dto.name }, { slug }] },
      });

      if (existing) {
        throw new ConflictException('Brand with this name already exists');
      }

      const brand = await this.prisma.brand.create({
        data: {
          name: dto.name,
          slug,
          logo: dto.logo,
          isActive: dto.isActive ?? true,
        },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Created brand ${brand.id}, cache invalidated`);

      return brand;
    } catch (error) {
      this.logger.error(`Error creating brand: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create brand',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(pagination: PaginationDto) {
    try {
      this.logger.log(`Finding all brands with pagination: ${JSON.stringify(pagination)}`);
      
      const { page = 1, limit = 20 } = pagination;
      const skip = (page - 1) * limit;

      const cacheKey = `brand:all:page:${page}:limit:${limit}`;

      const cached = await this.cacheService.getCachedBrands(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit for ${cacheKey}`);
        return cached;
      }

      const [data, total] = await Promise.all([
        this.prisma.brand.findMany({
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          include: { _count: { select: { products: true } } },
        }),
        this.prisma.brand.count(),
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

      await this.cacheService.cacheBrands(cacheKey, result);
      this.logger.log(`Cached result for ${cacheKey}`);

      return result;
    } catch (error) {
      this.logger.error(`Error finding all brands: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find brands',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findActive() {
    try {
      this.logger.log('Finding active brands');
      
      const cacheKey = 'brand:active';

      const cached = await this.cacheService.getCachedBrands(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit for ${cacheKey}`);
        return cached;
      }

      const brands = await this.prisma.brand.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, logo: true },
      });

      await this.cacheService.cacheBrands(cacheKey, brands);
      this.logger.log(`Cached result for ${cacheKey}`);

      return brands;
    } catch (error) {
      this.logger.error(`Error finding active brands: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find active brands',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string) {
    try {
      this.logger.log(`Finding brand: ${id}`);
      
      const cached = await this.cacheService.getCachedBrand(id);
      if (cached) {
        this.logger.log(`Cache hit for brand ${id}`);
        return cached;
      }

      const brand = await this.prisma.brand.findUnique({
        where: { id },
        include: { _count: { select: { products: true } } },
      });

      if (!brand) {
        throw new NotFoundException(`Brand with ID ${id} not found`);
      }

      await this.cacheService.cacheBrand(id, brand);
      return brand;
    } catch (error) {
      this.logger.error(`Error finding brand ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find brand',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, dto: UpdateBrandDto) {
    try {
      this.logger.log(`Updating brand: ${id}`);
      
      await this.findOne(id);

      const updateData: any = { ...dto };
      if (dto.name) {
        updateData.slug = this.generateSlug(dto.name);
      }

      const brand = await this.prisma.brand.update({
        where: { id },
        data: updateData,
      });

      await this.cacheService.invalidateBrand(id);
      this.logger.log(`Updated brand ${id}, cache invalidated`);

      return brand;
    } catch (error) {
      this.logger.error(`Error updating brand ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to update brand',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: string) {
    try {
      this.logger.log(`Removing brand: ${id}`);
      
      await this.findOne(id);

      const productsCount = await this.prisma.product.count({
        where: { brandId: id },
      });

      if (productsCount > 0) {
        throw new ConflictException(
          `Cannot delete brand with ${productsCount} associated products`,
        );
      }

      await this.prisma.brand.delete({ where: { id } });
      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Deleted brand ${id}, cache invalidated`);

      return { message: 'Brand deleted successfully' };
    } catch (error) {
      this.logger.error(`Error removing brand ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to remove brand',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
