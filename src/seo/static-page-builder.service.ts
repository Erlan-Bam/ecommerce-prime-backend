import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/services/prisma.service';
import { UpsertStaticPageDto } from './dto';

const ALLOWED_BLOCK_TYPES = new Set([
  'hero',
  'richText',
  'imageText',
  'cards',
  'stats',
  'steps',
  'table',
  'info',
  'cta',
  'map',
  'contactForm',
  'promotionGrid',
  'productGrid',
]);

@Injectable()
export class StaticPageBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePath(value: string): string {
    const withoutQuery = (value || '/').split('?')[0].split('#')[0].trim();
    const withLeadingSlash = withoutQuery.startsWith('/')
      ? withoutQuery
      : `/${withoutQuery}`;
    const normalized = withLeadingSlash.replace(/\/{2,}/g, '/');
    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : '/';
  }

  private cleanOptionalString(value?: string | null): string | null {
    const cleaned = value?.trim();
    return cleaned || null;
  }

  private normalizeBlocks(blocks: UpsertStaticPageDto['blocks']) {
    if (blocks.length > 100) {
      throw new HttpException('Too many page blocks', HttpStatus.BAD_REQUEST);
    }

    return blocks.map((block) => {
      if (!ALLOWED_BLOCK_TYPES.has(block.type)) {
        throw new HttpException(
          `Unsupported page block type: ${block.type}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      return {
        type: block.type,
        version: block.version || 1,
        data: block.data || {},
      };
    });
  }

  async listAdminPages() {
    const [seoRows, contentRows] = await Promise.all([
      this.prisma.staticPageSeo.findMany({ orderBy: { path: 'asc' } }),
      this.prisma.staticPageContent.findMany({ orderBy: { path: 'asc' } }),
    ]);

    const seoByPath = new Map(seoRows.map((row) => [row.path, row]));
    const paths = Array.from(
      new Set([...seoRows.map((row) => row.path), ...contentRows.map((row) => row.path)]),
    ).sort();
    const contentByPath = new Map(contentRows.map((row) => [row.path, row]));

    return paths.map((path) => {
      const seo = seoByPath.get(path);
      const content = contentByPath.get(path);
      return {
        id: seo?.id || content?.id || null,
        contentId: content?.id || null,
        path,
        name: seo?.name || seo?.title || path,
        title: seo?.title || seo?.name || path,
        seoTitle: seo?.seoTitle || null,
        seoDescription: seo?.seoDescription || null,
        seoH1: seo?.seoH1 || null,
        isActive: seo?.isActive ?? true,
        blocks: Array.isArray(content?.blocks) ? content.blocks : [],
        updatedAt: content?.updatedAt || seo?.updatedAt || null,
      };
    });
  }

  async findPublicPage(pathValue: string) {
    const path = this.normalizePath(pathValue);
    const [seo, content] = await Promise.all([
      this.prisma.staticPageSeo.findUnique({ where: { path } }),
      this.prisma.staticPageContent.findUnique({ where: { path } }),
    ]);

    if (!content) return null;

    return {
      id: seo?.id || content.id,
      path,
      name: seo?.name || seo?.title || path,
      title: seo?.title || seo?.name || path,
      seoTitle: seo?.seoTitle || null,
      seoDescription: seo?.seoDescription || null,
      seoH1: seo?.seoH1 || null,
      isActive: seo?.isActive ?? true,
      blocks: Array.isArray(content.blocks) ? content.blocks : [],
      updatedAt: content.updatedAt,
    };
  }

  async upsertPage(dto: UpsertStaticPageDto) {
    const path = this.normalizePath(dto.path);
    const blocks = this.normalizeBlocks(dto.blocks);
    const data = {
      name: this.cleanOptionalString(dto.name),
      title: this.cleanOptionalString(dto.title),
      seoTitle: this.cleanOptionalString(dto.seoTitle),
      seoDescription: this.cleanOptionalString(dto.seoDescription),
      seoH1: this.cleanOptionalString(dto.seoH1),
      isActive: dto.isActive ?? true,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.staticPageSeo.upsert({
        where: { path },
        create: { path, ...data },
        update: data,
      });
      await tx.staticPageContent.upsert({
        where: { path },
        create: { path, blocks: blocks as Prisma.InputJsonValue },
        update: { blocks: blocks as Prisma.InputJsonValue },
      });
    });

    return this.findPublicPage(path);
  }

  async removePage(pathValue: string) {
    const path = this.normalizePath(pathValue);
    const content = await this.prisma.staticPageContent.findUnique({ where: { path } });
    if (!content) return { path };

    await this.prisma.staticPageSeo.upsert({
      where: { path },
      create: { path, name: path, title: path, isActive: false },
      update: { isActive: false },
    });
    return { path, disabled: true };
  }
}
