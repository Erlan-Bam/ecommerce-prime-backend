import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BlogProductPlacement, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/services/prisma.service';
import { BlogCacheService } from './cache.service';
import { CreateBlogDto, UpdateBlogDto } from '../dto';
import { PaginationDto } from '../../shared/dto/pagination.dto';

const PUBLIC_AUTHOR_SELECT = {
  id: true,
  name: true,
  avatarUrl: true,
  bio: true,
} satisfies Prisma.BlogAuthorSelect;

const PRODUCT_BLOCK_INCLUDE = {
  orderBy: { sortOrder: 'asc' as const },
  include: {
    items: {
      orderBy: { sortOrder: 'asc' as const },
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: 'asc' as const } },
            attributes: true,
            productStock: true,
          },
        },
      },
    },
  },
};

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: BlogCacheService,
  ) {}

  private async getListCacheTtl(now: Date): Promise<number> {
    const nextScheduled = await this.prisma.blog.findFirst({
      where: {
        isActive: true,
        publishedAt: { gt: now },
      },
      orderBy: { publishedAt: 'asc' },
      select: { publishedAt: true },
    });

    if (!nextScheduled) return 3600;

    const secondsUntilPublication = Math.ceil(
      (nextScheduled.publishedAt.getTime() - now.getTime()) / 1000,
    );
    return Math.max(1, Math.min(3600, secondsUntilPublication));
  }

  private normalizeProductBlocks(blocks: CreateBlogDto['productBlocks']) {
    if (!blocks) return undefined;

    return blocks.map((block, blockIndex) => {
      const productIds = block.items.map((item) => item.productId);
      if (new Set(productIds).size !== productIds.length) {
        throw new HttpException(
          'Product block cannot contain duplicate products',
          HttpStatus.BAD_REQUEST,
        );
      }

      return {
        title: block.title?.trim() || null,
        placement: block.placement ?? BlogProductPlacement.AFTER_ARTICLE,
        sortOrder: block.sortOrder ?? blockIndex,
        items: {
          create: block.items.map((item, itemIndex) => ({
            productId: item.productId,
            sortOrder: item.sortOrder ?? itemIndex,
          })),
        },
      };
    });
  }

  private async resolveAuthor(
    authorId?: string,
    legacyAuthor?: string,
  ): Promise<{ authorId: string | null; author: string }> {
    if (!authorId) {
      return {
        authorId: null,
        author: legacyAuthor?.trim() || 'Редакция Prime',
      };
    }

    const author = await this.prisma.blogAuthor.findUnique({
      where: { id: authorId },
      select: { id: true, name: true },
    });

    if (!author) {
      throw new HttpException('Blog author not found', HttpStatus.BAD_REQUEST);
    }

    return { authorId: author.id, author: author.name };
  }

  async findAll(pagination: PaginationDto) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const cacheKey = `blog:list:active:${page}:${limit}`;

      const cached = await this.cacheService.getCachedPosts(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached blog posts list');
        return cached;
      }

      const now = new Date();
      const skip = (page - 1) * limit;
      const publicWhere: Prisma.BlogWhereInput = {
        isActive: true,
        publishedAt: { lte: now },
      };

      const [posts, total, cacheTtl] = await Promise.all([
        this.prisma.blog.findMany({
          where: publicWhere,
          orderBy: { publishedAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            text: true,
            slug: true,
            excerpt: true,
            imageUrl: true,
            author: true,
            authorId: true,
            authorProfile: { select: PUBLIC_AUTHOR_SELECT },
            readTime: true,
            tags: true,
            meta: true,
            isActive: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.blog.count({ where: publicWhere }),
        this.getListCacheTtl(now),
      ]);

      const result = {
        data: posts,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };

      // Do not cache beyond the nearest scheduled publication moment.
      await this.cacheService.cachePosts(cacheKey, result, cacheTtl);

      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error fetching blog posts: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to fetch blog posts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAllAdmin(pagination: PaginationDto) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const skip = (page - 1) * limit;

      const [posts, total] = await Promise.all([
        this.prisma.blog.findMany({
          orderBy: { publishedAt: 'desc' },
          skip,
          take: limit,
          include: {
            authorProfile: { select: PUBLIC_AUTHOR_SELECT },
            _count: { select: { productBlocks: true } },
          },
        }),
        this.prisma.blog.count(),
      ]);

      return {
        data: posts,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error fetching all blog posts: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to fetch blog posts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findBySlug(slug: string) {
    try {
      const cached =
        (await this.cacheService.getCachedPost(slug)) ||
        (await this.cacheService.getCachedPostById(slug));
      if (cached) {
        this.logger.debug(`Returning cached blog post: ${slug}`);
        return cached;
      }

      const post = await this.prisma.blog.findFirst({
        where: {
          isActive: true,
          publishedAt: { lte: new Date() },
          OR: [{ slug }, { id: slug }],
        },
        include: {
          authorProfile: { select: PUBLIC_AUTHOR_SELECT },
          productBlocks: {
            where: { placement: BlogProductPlacement.AFTER_ARTICLE },
            orderBy: { sortOrder: 'asc' },
            include: {
              items: {
                where: {
                  product: { isActive: true, isDeleted: false },
                },
                orderBy: { sortOrder: 'asc' },
                include: {
                  product: {
                    include: {
                      images: { orderBy: { sortOrder: 'asc' } },
                      attributes: true,
                      productStock: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!post) {
        throw new HttpException('Blog post not found', HttpStatus.NOT_FOUND);
      }

      await this.cacheService.cachePost(post.slug, post);
      await this.cacheService.cachePostById(post.id, post);

      return post;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error fetching blog post: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to fetch blog post',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findById(id: string) {
    try {
      const post = await this.prisma.blog.findUnique({
        where: { id },
        include: {
          authorProfile: { select: PUBLIC_AUTHOR_SELECT },
          productBlocks: PRODUCT_BLOCK_INCLUDE,
        },
      });

      if (!post) {
        throw new HttpException('Blog post not found', HttpStatus.NOT_FOUND);
      }

      return post;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error fetching blog post: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to fetch blog post',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async create(dto: CreateBlogDto) {
    try {
      const existing = await this.prisma.blog.findUnique({
        where: { slug: dto.slug },
      });
      if (existing) {
        throw new HttpException(
          'Blog post with this slug already exists',
          HttpStatus.BAD_REQUEST,
        );
      }

      const resolvedAuthor = await this.resolveAuthor(dto.authorId, dto.author);
      const productBlocks = this.normalizeProductBlocks(dto.productBlocks);

      const post = await this.prisma.blog.create({
        data: {
          title: dto.title,
          text: dto.text,
          slug: dto.slug,
          excerpt: dto.excerpt || null,
          imageUrl: dto.imageUrl || null,
          author: resolvedAuthor.author,
          authorId: resolvedAuthor.authorId,
          readTime: dto.readTime || '5 мин',
          tags: dto.tags || [],
          meta: dto.meta || null,
          isActive: dto.isActive ?? true,
          publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(),
          ...(productBlocks && {
            productBlocks: { create: productBlocks },
          }),
        },
        include: {
          authorProfile: { select: PUBLIC_AUTHOR_SELECT },
          productBlocks: PRODUCT_BLOCK_INCLUDE,
        },
      });

      await this.cacheService.invalidateAllCaches();
      this.logger.log(`Created blog post: ${post.id}`);
      return post;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error creating blog post: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to create blog post',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, dto: UpdateBlogDto) {
    try {
      const existing = await this.prisma.blog.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpException('Blog post not found', HttpStatus.NOT_FOUND);
      }

      if (dto.slug && dto.slug !== existing.slug) {
        const slugExists = await this.prisma.blog.findUnique({
          where: { slug: dto.slug },
        });
        if (slugExists) {
          throw new HttpException(
            'Blog post with this slug already exists',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const resolvedAuthor =
        dto.authorId !== undefined || dto.author !== undefined
          ? await this.resolveAuthor(dto.authorId, dto.author ?? existing.author)
          : null;
      const productBlocks = this.normalizeProductBlocks(dto.productBlocks);

      const post = await this.prisma.$transaction(async (tx) => {
        if (dto.productBlocks !== undefined) {
          await tx.blogProductBlock.deleteMany({ where: { blogId: id } });
        }

        return tx.blog.update({
          where: { id },
          data: {
            ...(dto.title !== undefined && { title: dto.title }),
            ...(dto.text !== undefined && { text: dto.text }),
            ...(dto.slug !== undefined && { slug: dto.slug }),
            ...(dto.excerpt !== undefined && { excerpt: dto.excerpt || null }),
            ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl || null }),
            ...(resolvedAuthor && {
              author: resolvedAuthor.author,
              authorId: resolvedAuthor.authorId,
            }),
            ...(dto.readTime !== undefined && { readTime: dto.readTime }),
            ...(dto.tags !== undefined && { tags: dto.tags }),
            ...(dto.meta !== undefined && { meta: dto.meta }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            ...(dto.publishedAt !== undefined && {
              publishedAt: new Date(dto.publishedAt),
            }),
            ...(productBlocks !== undefined && {
              productBlocks: { create: productBlocks },
            }),
          },
          include: {
            authorProfile: { select: PUBLIC_AUTHOR_SELECT },
            productBlocks: PRODUCT_BLOCK_INCLUDE,
          },
        });
      });

      await this.cacheService.invalidatePost(id, existing.slug);
      if (dto.slug && dto.slug !== existing.slug) {
        await this.cacheService.invalidatePost(id, dto.slug);
      }

      this.logger.log(`Updated blog post: ${post.id}`);
      return post;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error updating blog post: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to update blog post',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async delete(id: string) {
    try {
      const existing = await this.prisma.blog.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpException('Blog post not found', HttpStatus.NOT_FOUND);
      }

      await this.prisma.blog.delete({ where: { id } });
      await this.cacheService.invalidatePost(id, existing.slug);

      this.logger.log(`Deleted blog post: ${id}`);
      return { deleted: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Error deleting blog post: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        'Failed to delete blog post',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
