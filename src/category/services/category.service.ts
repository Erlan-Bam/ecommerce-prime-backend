import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { ReorderCategoriesDto } from '../dto/reorder-categories.dto';
import { ReorderMainCategoriesDto } from '../dto/reorder-main-categories.dto';
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
    const translitMap: Record<string, string> = {
      а: 'a',
      б: 'b',
      в: 'v',
      г: 'g',
      д: 'd',
      е: 'e',
      ё: 'yo',
      ж: 'zh',
      з: 'z',
      и: 'i',
      й: 'y',
      к: 'k',
      л: 'l',
      м: 'm',
      н: 'n',
      о: 'o',
      п: 'p',
      р: 'r',
      с: 's',
      т: 't',
      у: 'u',
      ф: 'f',
      х: 'kh',
      ц: 'ts',
      ч: 'ch',
      ш: 'sh',
      щ: 'shch',
      ъ: '',
      ы: 'y',
      ь: '',
      э: 'e',
      ю: 'yu',
      я: 'ya',
    };
    return title
      .toLowerCase()
      .split('')
      .map((ch) => translitMap[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
  }

  private buildCategoryTree<
    T extends {
      id: string;
      parentId: string | null;
      title: string;
      sortOrder?: number;
    },
  >(categories: T[]): Array<T & { children: Array<T & { children: any[] }> }> {
    const nodes = new Map<string, T & { children: any[] }>();
    const roots: Array<T & { children: any[] }> = [];

    categories.forEach((category) => {
      nodes.set(category.id, { ...category, children: [] });
    });

    nodes.forEach((category) => {
      if (category.parentId && nodes.has(category.parentId)) {
        nodes.get(category.parentId)!.children.push(category);
      } else {
        roots.push(category);
      }
    });

    const sortNodes = (items: Array<T & { children: any[] }>) => {
      items.sort((a, b) => {
        const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (orderDiff !== 0) return orderDiff;

        return a.title.localeCompare(b.title, 'ru');
      });
      items.forEach((item) => sortNodes(item.children));
    };

    sortNodes(roots);
    return roots;
  }

  private addDistinctProductCounts(
    tree: Array<any>,
    productCategories: Array<{ categoryId: string; productId: string }>,
  ) {
    const productIdsByCategory = new Map<string, Set<string>>();
    for (const relation of productCategories) {
      const productIds =
        productIdsByCategory.get(relation.categoryId) ?? new Set<string>();
      productIds.add(relation.productId);
      productIdsByCategory.set(relation.categoryId, productIds);
    }

    const addCounts = (category: any): [any, Set<string>] => {
      const productIds = new Set(productIdsByCategory.get(category.id) ?? []);
      const children = (category.children ?? []).map((child: any) => {
        const [childWithCount, childProductIds] = addCounts(child);
        childProductIds.forEach((productId) => productIds.add(productId));
        return childWithCount;
      });

      return [
        {
          ...category,
          children,
          productCount: productIds.size,
        },
        productIds,
      ];
    };

    return tree.map((category) => addCounts(category)[0]);
  }

  private async getNextMainSortOrder(): Promise<number> {
    const lastMainCategory = await this.prisma.category.findFirst({
      where: { isMain: true, isDeleted: false },
      orderBy: { mainSortOrder: 'desc' },
      select: { mainSortOrder: true },
    });

    return (lastMainCategory?.mainSortOrder ?? 0) + 1;
  }

  async create(createCategoryDto: CreateCategoryDto) {
    try {
      this.logger.log(`Creating category: ${createCategoryDto.title}`);

      const slug = createCategoryDto.slug?.trim()
        ? this.generateSlug(createCategoryDto.slug)
        : this.generateSlug(createCategoryDto.title);

      const mainSortOrder =
        createCategoryDto.isMain && !createCategoryDto.mainSortOrder
          ? await this.getNextMainSortOrder()
          : createCategoryDto.mainSortOrder;
      const category = await this.prisma.category.create({
        data: {
          ...createCategoryDto,
          slug,
          ...(mainSortOrder !== undefined ? { mainSortOrder } : {}),
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
      this.logger.error(
        `Error creating category: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(paginationDto: PaginationDto & { includeInactive?: boolean }) {
    try {
      this.logger.log(
        `Finding all categories with pagination: ${JSON.stringify(paginationDto)}`,
      );

      const { page = 1, limit = 10 } = paginationDto;
      const includeInactive = paginationDto.includeInactive === true;
      const skip = (page - 1) * limit;
      const where = includeInactive
        ? { isDeleted: false }
        : { isActive: true, isDeleted: false };

      const cacheKey = `category:all:page:${page}:limit:${limit}:includeInactive:${includeInactive}`;

      const cached = await this.cacheService.getCachedCategories(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit for ${cacheKey}`);
        return cached;
      }

      const [data, total] = await Promise.all([
        this.prisma.category.findMany({
          where,
          skip,
          take: limit,
          include: {
            parent: { select: { id: true, title: true, slug: true } },
            children: {
              where,
              select: { id: true, title: true, slug: true, image: true },
              orderBy: { sortOrder: 'asc' },
            },
            _count: {
              select: {
                products: {
                  where: {
                    product: { isActive: true, isDeleted: false },
                  },
                },
                children: true,
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        }),
        this.prisma.category.count({
          where,
        }),
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
      this.logger.error(
        `Error finding all categories: ${error.message}`,
        error.stack,
      );
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
        where: { isActive: true, isDeleted: false },
        include: {
          _count: {
            select: {
              products: {
                where: {
                  product: { isActive: true, isDeleted: false },
                },
              },
              children: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      });
      const tree = this.buildCategoryTree(categories);
      const productCategories =
        categories.length > 0
          ? await this.prisma.productCategory.findMany({
              where: {
                categoryId: { in: categories.map((category) => category.id) },
                product: { isActive: true, isDeleted: false },
              },
              select: { categoryId: true, productId: true },
            })
          : [];
      const treeWithProductCounts = this.addDistinctProductCounts(
        tree,
        productCategories,
      );

      await this.cacheService.cacheCategories(cacheKey, treeWithProductCounts);
      return treeWithProductCounts;
    } catch (error) {
      this.logger.error(
        `Error finding category tree: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find category tree',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findMain() {
    try {
      this.logger.log('Finding main categories');

      const cacheKey = 'category:main';
      const cached = await this.cacheService.getCachedCategories(cacheKey);
      if (cached) {
        return cached;
      }

      const categories = await this.prisma.category.findMany({
        where: { isActive: true, isDeleted: false },
        include: {
          _count: {
            select: {
              products: {
                where: {
                  product: { isActive: true, isDeleted: false },
                },
              },
              children: true,
            },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      });
      const tree = this.buildCategoryTree(categories);
      const productCategories =
        categories.length > 0
          ? await this.prisma.productCategory.findMany({
              where: {
                categoryId: { in: categories.map((category) => category.id) },
                product: { isActive: true, isDeleted: false },
              },
              select: { categoryId: true, productId: true },
            })
          : [];
      const treeWithProductCounts = this.addDistinctProductCounts(
        tree,
        productCategories,
      );
      const allNodes: any[] = [];
      const collectNodes = (nodes: any[]) => {
        nodes.forEach((node) => {
          allNodes.push(node);
          collectNodes(node.children ?? []);
        });
      };
      collectNodes(treeWithProductCounts);

      const mainCategories = allNodes
        .filter((category) => category.isMain)
        .sort((a, b) => {
          const orderDiff = a.mainSortOrder - b.mainSortOrder;
          return orderDiff || a.title.localeCompare(b.title, 'ru');
        });

      await this.cacheService.cacheCategories(cacheKey, mainCategories);
      return mainCategories;
    } catch (error) {
      this.logger.error(
        `Error finding main categories: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find main categories',
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
            where: { isActive: true, isDeleted: false },
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { products: true } },
        },
      });

      if (!category || category.isDeleted) {
        throw new HttpException(`Category not found`, HttpStatus.NOT_FOUND);
      }

      return category;
    } catch (error) {
      this.logger.error(
        `Error finding category by slug ${slug}: ${error.message}`,
        error.stack,
      );
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
            where: { isActive: true, isDeleted: false },
            orderBy: { sortOrder: 'asc' },
          },
          _count: { select: { products: true } },
        },
      });

      if (!category || category.isDeleted) {
        throw new HttpException(
          `Category with ID ${id} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      await this.cacheService.cacheCategory(id, category);
      this.logger.log(`Cached category ${id}`);

      return category;
    } catch (error) {
      this.logger.error(
        `Error finding category ${id}: ${error.message}`,
        error.stack,
      );
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

      const existingCategory = await this.findOne(id);

      const updateData: any = { ...updateCategoryDto };
      if (updateCategoryDto.isMain === false) {
        updateData.mainSortOrder = 0;
      } else if (
        updateCategoryDto.isMain === true &&
        !existingCategory.isMain &&
        !updateCategoryDto.mainSortOrder
      ) {
        updateData.mainSortOrder = await this.getNextMainSortOrder();
      }
      if (updateCategoryDto.slug?.trim()) {
        updateData.slug = this.generateSlug(updateCategoryDto.slug);
      } else if (updateCategoryDto.title) {
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
      this.logger.error(
        `Error updating category ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to update category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async reorder(reorderCategoriesDto: ReorderCategoriesDto) {
    try {
      const items = reorderCategoriesDto.items;
      const ids = items.map((item) => item.id);

      this.logger.log(`Reordering categories: ${ids.join(', ')}`);

      if (new Set(ids).size !== ids.length) {
        throw new HttpException(
          'A category can only appear once in the order',
          HttpStatus.BAD_REQUEST,
        );
      }

      const categories = await this.prisma.category.findMany({
        where: {
          id: { in: ids },
          isDeleted: false,
        },
        select: { id: true, parentId: true },
      });

      if (categories.length !== items.length) {
        throw new HttpException(
          'One or more categories not found',
          HttpStatus.NOT_FOUND,
        );
      }

      const parentIds = new Set(
        categories.map((category) => category.parentId ?? null),
      );
      if (parentIds.size !== 1) {
        throw new HttpException(
          'Categories can only be reordered within the same level',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.prisma.$transaction(
        items.map((item) =>
          this.prisma.category.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          }),
        ),
      );

      await this.cacheService.invalidateAllCaches();
      this.logger.log(
        `Reordered ${items.length} categories, cache invalidated`,
      );

      return { updated: items.length };
    } catch (error) {
      this.logger.error(
        `Error reordering categories: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to reorder categories',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async reorderMain(reorderMainCategoriesDto: ReorderMainCategoriesDto) {
    try {
      const items = reorderMainCategoriesDto.items;
      const ids = items.map((item) => item.id);

      if (new Set(ids).size !== ids.length) {
        throw new HttpException(
          'A category can only appear once in the main order',
          HttpStatus.BAD_REQUEST,
        );
      }

      const categories = await this.prisma.category.findMany({
        where: { id: { in: ids }, isMain: true, isDeleted: false },
        select: { id: true },
      });

      if (categories.length !== items.length) {
        throw new HttpException(
          'One or more main categories not found',
          HttpStatus.NOT_FOUND,
        );
      }

      await this.prisma.$transaction(
        items.map((item) =>
          this.prisma.category.update({
            where: { id: item.id },
            data: { mainSortOrder: item.mainSortOrder },
          }),
        ),
      );

      await this.cacheService.invalidateAllCaches();
      return { updated: items.length };
    } catch (error) {
      this.logger.error(
        `Error reordering main categories: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to reorder main categories',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: string) {
    try {
      this.logger.log(`Soft deleting category: ${id}`);

      await this.findOne(id);

      const category = await this.prisma.category.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Soft deleted category ${id}, cache invalidated`);

      return category;
    } catch (error) {
      this.logger.error(
        `Error removing category ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to remove category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async restore(id: string) {
    try {
      this.logger.log(`Restoring category: ${id}`);

      const category = await this.prisma.category.findUnique({
        where: { id },
      });

      if (!category) {
        throw new HttpException(
          `Category with ID ${id} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      if (!category.isDeleted) {
        throw new HttpException(
          'Category is not deleted',
          HttpStatus.BAD_REQUEST,
        );
      }

      const daysSinceDeleted =
        (Date.now() - new Date(category.deletedAt).getTime()) /
        (1000 * 60 * 60 * 24);

      if (daysSinceDeleted > 7) {
        throw new HttpException(
          'Category cannot be restored after 7 days',
          HttpStatus.BAD_REQUEST,
        );
      }

      const restored = await this.prisma.category.update({
        where: { id },
        data: {
          isDeleted: false,
          deletedAt: null,
        },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Restored category ${id}, cache invalidated`);

      return restored;
    } catch (error) {
      this.logger.error(
        `Error restoring category ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to restore category',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findDeleted(paginationDto: PaginationDto) {
    try {
      this.logger.log('Finding deleted categories');

      const { page = 1, limit = 10 } = paginationDto;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.prisma.category.findMany({
          where: { isDeleted: true },
          skip,
          take: limit,
          orderBy: { deletedAt: 'desc' },
          include: {
            parent: { select: { id: true, title: true, slug: true } },
            _count: { select: { products: true } },
          },
        }),
        this.prisma.category.count({ where: { isDeleted: true } }),
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
    } catch (error) {
      this.logger.error(
        `Error finding deleted categories: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find deleted categories',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
