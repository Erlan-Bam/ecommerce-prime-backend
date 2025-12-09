import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { CategoryCacheService } from './cache.service';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    private prisma: PrismaService,
    private cacheService: CategoryCacheService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const category = await this.prisma.category.create({
      data: createCategoryDto,
      include: {
        parent: true,
        children: true,
      },
    });

    await this.cacheService.invalidateAllCaches();
    this.logger.log(`Created category ${category.id}, cache invalidated`);

    return category;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const cacheKey = `category:all:page:${page}:limit:${limit}`;

    const cached = await this.cacheService.getCachedCategories(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for ${cacheKey}`);
      return cached;
    }

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        skip,
        take: limit,
        include: {
          parent: true,
          children: true,
        },
        orderBy: {
          title: 'asc',
        },
      }),
      this.prisma.category.count(),
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

    await this.cacheService.cacheCategories(cacheKey, result);
    this.logger.log(`Cached result for ${cacheKey}`);

    return result;
  }

  async findOne(id: string) {
    const cached = await this.cacheService.getCachedCategory(id);
    if (cached) {
      this.logger.log(`Cache hit for category ${id}`);
      return cached;
    }

    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    await this.cacheService.cacheCategory(id, category);
    this.logger.log(`Cached category ${id}`);

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id);

    const category = await this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
      include: {
        parent: true,
        children: true,
      },
    });

    await this.cacheService.invalidateAllCaches();
    this.logger.log(`Updated category ${id}, cache invalidated`);

    return category;
  }

  async remove(id: string) {
    await this.findOne(id);

    const category = await this.prisma.category.delete({
      where: { id },
    });

    await this.cacheService.invalidateAllCaches();
    this.logger.log(`Deleted category ${id}, cache invalidated`);

    return category;
  }
}
