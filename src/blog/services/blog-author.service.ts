import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreateBlogAuthorDto, UpdateBlogAuthorDto } from '../dto/blog-author.dto';
import { BlogCacheService } from './cache.service';

@Injectable()
export class BlogAuthorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: BlogCacheService,
  ) {}

  findAll() {
    return this.prisma.blogAuthor.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { posts: true } } },
    });
  }

  async findOne(id: string) {
    const author = await this.prisma.blogAuthor.findUnique({
      where: { id },
      include: { _count: { select: { posts: true } } },
    });
    if (!author) throw new HttpException('Blog author not found', HttpStatus.NOT_FOUND);
    return author;
  }

  async create(dto: CreateBlogAuthorDto) {
    const name = dto.name.trim();
    if (await this.prisma.blogAuthor.findUnique({ where: { name } })) {
      throw new HttpException('Author with this name already exists', HttpStatus.BAD_REQUEST);
    }
    const author = await this.prisma.blogAuthor.create({
      data: {
        name,
        avatarUrl: dto.avatarUrl?.trim() || null,
        bio: dto.bio?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.cacheService.invalidateAllCaches();
    return author;
  }

  async update(id: string, dto: UpdateBlogAuthorDto) {
    await this.findOne(id);
    if (dto.name) {
      const name = dto.name.trim();
      const duplicate = await this.prisma.blogAuthor.findFirst({
        where: { name, id: { not: id } },
      });
      if (duplicate) {
        throw new HttpException('Author with this name already exists', HttpStatus.BAD_REQUEST);
      }
    }
    const author = await this.prisma.blogAuthor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl.trim() || null }),
        ...(dto.bio !== undefined && { bio: dto.bio.trim() || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    if (dto.name !== undefined) {
      await this.prisma.blog.updateMany({
        where: { authorId: id },
        data: { author: author.name },
      });
    }
    await this.cacheService.invalidateAllCaches();
    return author;
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.prisma.blogAuthor.delete({ where: { id } });
    await this.cacheService.invalidateAllCaches();
    return { deleted: true };
  }
}
