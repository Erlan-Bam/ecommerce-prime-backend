import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9а-яё\s-]/gi, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  async create(createCategoryDto: CreateCategoryDto) {
    try {
      this.logger.log(`Creating category: ${createCategoryDto.title}`);
      
      const slug = this.generateSlug(createCategoryDto.title);

      const category = await this.prisma.category.create({
        data: {
          ...createCategoryDto,
          slug,
        },
        include: {
          parent: true,
          children: true,
        },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Created category ${category.id}, cache invalidated`);

      return category;
    } catch (error) {
      this.logger.error(`Error creating category: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(paginationDto: PaginationDto) {
    try {
      this.logger.log(`Finding all categories with pagination: ${JSON.stringify(paginationDto)}`);
      
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
          where: { isActive: true },
          skip,
          take: limit,
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
    } catch (error) {
      this.logger.error(`Error finding all categories: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find categories',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findTree() {
    try {
      this.logger.log('Finding category tree');
      
      const cacheKey = 'category:tree';
      const cached = await this.cacheService.getCachedCategories(cacheKey);
      if (cached) {
        return cached;
      }

      const categories = await this.prisma.category.findMany({
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

      await this.cacheService.cacheCategories(cacheKey, categories);
      return categories;
    } catch (error) {
      this.logger.error(`Error finding category tree: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find category tree',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findBySlug(slug: string) {
    try {
      this.logger.log(`Finding category by slug: ${slug}`);
      
      const category = await this.prisma.category.findUnique({
        where: { slug },
        include: {
          parent: { select: { id: true, title: true, slug: true } },
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { products: true } },
        },
      });

      if (!category) {
        throw new NotFoundException(`Category not found`);
      }

      return category;
    } catch (error) {
      this.logger.error(`Error finding category by slug ${slug}: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string) {
    try {
      this.logger.log(`Finding category: ${id}`);
      
      const cached = await this.cacheService.getCachedCategory(id);
      if (cached) {
        this.logger.log(`Cache hit for category ${id}`);
        return cached;
      }

      const category = await this.prisma.category.findUnique({
        where: { id },
        include: {
          parent: true,
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { products: true } },
        },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      await this.cacheService.cacheCategory(id, category);
      this.logger.log(`Cached category ${id}`);

      return category;
    } catch (error) {
      this.logger.error(`Error finding category ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    try {
      this.logger.log(`Updating category: ${id}`);
      
      await this.findOne(id);

      const updateData: any = { ...updateCategoryDto };
      if (updateCategoryDto.title) {
        updateData.slug = this.generateSlug(updateCategoryDto.title);
      }

      const category = await this.prisma.category.update({
        where: { id },
        data: updateData,
        include: {
          parent: true,
          children: true,
        },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Updated category ${id}, cache invalidated`);

      return category;
    } catch (error) {
      this.logger.error(`Error updating category ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to update category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: string) {
    try {
      this.logger.log(`Removing category: ${id}`);
      
      await this.findOne(id);

      const productsCount = await this.prisma.product.count({
        where: { categoryId: id },
      });

      if (productsCount > 0) {
        throw new ConflictException(
          `Cannot delete category with ${productsCount} associated products`,
        );
      }

      const childrenCount = await this.prisma.category.count({
        where: { parentId: id },
      });

      if (childrenCount > 0) {
        throw new ConflictException(
          `Cannot delete category with ${childrenCount} subcategories`,
        );
      }

      const category = await this.prisma.category.delete({
        where: { id },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Deleted category ${id}, cache invalidated`);

      return category;
    } catch (error) {
      this.logger.error(`Error removing category ${id}: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to remove category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
