import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { BlogCacheService } from './cache.service';
import { CreateBlogDto, UpdateBlogDto } from '../dto';
import { PaginationDto } from '../../shared/dto/pagination.dto';

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: BlogCacheService,
  ) {}

  async findAll(pagination: PaginationDto) {
    try {
      const { page = 1, limit = 10 } = pagination;
      const cacheKey = `blog:list:active:${page}:${limit}`;

      // Try cache first
      const cached = await this.cacheService.getCachedPosts(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached blog posts list');
        return cached;
      }

      const skip = (page - 1) * limit;

      const [posts, total] = await Promise.all([
        this.prisma.blog.findMany({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            title: true,
            slug: true,
            meta: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.blog.count({ where: { isActive: true } }),
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

      // Cache the result
      await this.cacheService.cachePosts(cacheKey, result);

      return result;
    } catch (error) {
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
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
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
      // Try cache first
      const cached = await this.cacheService.getCachedPost(slug);
      if (cached) {
        this.logger.debug(`Returning cached blog post: ${slug}`);
        return cached;
      }

      const post = await this.prisma.blog.findUnique({
        where: { slug },
      });

      if (!post || !post.isActive) {
        throw new HttpException('Blog post not found', HttpStatus.NOT_FOUND);
      }

      // Cache the result
      await this.cacheService.cachePost(slug, post);

      return post;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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
      });

      if (!post) {
        throw new HttpException('Blog post not found', HttpStatus.NOT_FOUND);
      }

      return post;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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
      // Check if slug already exists
      const existing = await this.prisma.blog.findUnique({
        where: { slug: dto.slug },
      });

      if (existing) {
        throw new HttpException(
          'Blog post with this slug already exists',
          HttpStatus.BAD_REQUEST,
        );
      }

      const post = await this.prisma.blog.create({
        data: {
          title: dto.title,
          text: dto.text,
          slug: dto.slug,
          meta: dto.meta || null,
          isActive: dto.isActive ?? true,
        },
      });

      // Invalidate list caches
      await this.cacheService.invalidateAllCaches();

      this.logger.log(`Created blog post: ${post.id}`);
      return post;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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
      // Check if post exists
      const existing = await this.prisma.blog.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new HttpException('Blog post not found', HttpStatus.NOT_FOUND);
      }

      // Check if new slug conflicts with existing
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

      const post = await this.prisma.blog.update({
        where: { id },
        data: {
          ...(dto.title && { title: dto.title }),
          ...(dto.text && { text: dto.text }),
          ...(dto.slug && { slug: dto.slug }),
          ...(dto.meta !== undefined && { meta: dto.meta }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      // Invalidate caches (old slug and new)
      await this.cacheService.invalidatePost(id, existing.slug);
      if (dto.slug && dto.slug !== existing.slug) {
        await this.cacheService.invalidatePost(id, dto.slug);
      }

      this.logger.log(`Updated blog post: ${post.id}`);
      return post;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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
      const existing = await this.prisma.blog.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new HttpException('Blog post not found', HttpStatus.NOT_FOUND);
      }

      await this.prisma.blog.delete({
        where: { id },
      });

      // Invalidate caches
      await this.cacheService.invalidatePost(id, existing.slug);

      this.logger.log(`Deleted blog post: ${id}`);
      return { deleted: true };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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
