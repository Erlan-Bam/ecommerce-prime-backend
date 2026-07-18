import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SeoPageType } from '@prisma/client';
import { PrismaService } from '../shared/services/prisma.service';
import {
  UpdateRobotsDto,
  UpdateSeoTemplateDto,
  UpdateStaticPageSeoDto,
  UpsertSeoCollectionDto,
  UpsertSeoTagTileDto,
} from './dto';
import {
  normalizeRobotsContent,
  normalizeSeoCollectionAttributes,
} from './seo-management';

const DEFAULT_STATIC_PAGES: Array<{ path: string; title: string }> = [
  { path: '/', title: 'Prime Electronics' },
  { path: '/about', title: 'О компании' },
  { path: '/delivery', title: 'Доставка' },
  { path: '/warranty', title: 'Гарантии' },
  { path: '/contacts', title: 'Контакты' },
  { path: '/promotions', title: 'Акции' },
  { path: '/trade-in', title: 'Trade-in' },
  { path: '/privacy', title: 'Политика конфиденциальности' },
  { path: '/cookies', title: 'Cookie' },
  { path: '/blog', title: 'Блог' },
];

const SEO_PAGE_TYPES = Object.values(SeoPageType);

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  normalizePath(path: string): string {
    const withoutQuery = (path || '/').split('?')[0].split('#')[0].trim();
    const withLeadingSlash = withoutQuery.startsWith('/')
      ? withoutQuery
      : `/${withoutQuery}`;
    const normalized = withLeadingSlash.replace(/\/{2,}/g, '/');
    if (normalized.length > 1) return normalized.replace(/\/+$/, '');
    return '/';
  }

  private cleanOptionalString(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private normalizeCollectionSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9а-я-]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private normalizeSortBy(value?: string | null): string | null {
    const allowed = new Set([
      'popularity',
      'price_asc',
      'price_desc',
      'newest',
      'rating',
    ]);
    const normalized = this.cleanOptionalString(value);
    return normalized && allowed.has(normalized) ? normalized : null;
  }

  private async ensureCategoryExists(categoryId?: string | null) {
    const normalizedCategoryId = this.cleanOptionalString(categoryId);
    if (!normalizedCategoryId) return null;

    const category = await this.prisma.category.findUnique({
      where: { id: normalizedCategoryId },
      select: { id: true, isDeleted: true },
    });
    if (!category || category.isDeleted) {
      throw new HttpException('Category not found', HttpStatus.BAD_REQUEST);
    }
    return category.id;
  }

  private async ensureCollectionExists(collectionId?: string | null) {
    const normalizedCollectionId = this.cleanOptionalString(collectionId);
    if (!normalizedCollectionId) return null;

    const collection = await this.prisma.seoCollection.findUnique({
      where: { id: normalizedCollectionId },
      select: { id: true },
    });
    if (!collection) {
      throw new HttpException('SEO collection not found', HttpStatus.BAD_REQUEST);
    }
    return collection.id;
  }

  private async ensureCollectionSlugAvailable(slug: string, id?: string) {
    const existing = await this.prisma.seoCollection.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existing && existing.id !== id) {
      throw new HttpException(
        'SEO collection slug is already in use',
        HttpStatus.CONFLICT,
      );
    }
  }

  private async collectionData(dto: UpsertSeoCollectionDto) {
    const slug = this.normalizeCollectionSlug(dto.slug);
    const name = dto.name.trim();
    if (!slug || !name) {
      throw new HttpException(
        'SEO collection name and slug are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      dto.minPrice !== undefined &&
      dto.maxPrice !== undefined &&
      dto.minPrice !== null &&
      dto.maxPrice !== null &&
      dto.minPrice > dto.maxPrice
    ) {
      throw new HttpException(
        'Minimum price cannot exceed maximum price',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      name,
      slug,
      categoryId: await this.ensureCategoryExists(dto.categoryId),
      brandIds: Array.from(
        new Set((dto.brandIds || []).map((id) => id.trim()).filter(Boolean)),
      ),
      minPrice: dto.minPrice ?? null,
      maxPrice: dto.maxPrice ?? null,
      inStock: dto.inStock ?? false,
      isOnSale: dto.isOnSale ?? false,
      attributes: normalizeSeoCollectionAttributes(dto.attributes),
      sortBy: this.normalizeSortBy(dto.sortBy),
      description: this.cleanOptionalString(dto.description),
      seoTitle: this.cleanOptionalString(dto.seoTitle),
      seoDescription: this.cleanOptionalString(dto.seoDescription),
      seoH1: this.cleanOptionalString(dto.seoH1),
      isActive: dto.isActive ?? true,
      sortOrder: Number.isFinite(dto.sortOrder) ? Number(dto.sortOrder) : 0,
    };
  }

  private async tagTileData(dto: UpsertSeoTagTileDto) {
    const title = dto.title.trim();
    const collectionId = await this.ensureCollectionExists(dto.collectionId);
    const url = this.cleanOptionalString(dto.url);
    if (!title || (!collectionId && !url)) {
      throw new HttpException(
        'Tag tile title and destination are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      title,
      image: this.cleanOptionalString(dto.image),
      categoryId: await this.ensureCategoryExists(dto.categoryId),
      collectionId,
      url,
      isActive: dto.isActive ?? true,
      sortOrder: Number.isFinite(dto.sortOrder) ? Number(dto.sortOrder) : 0,
    };
  }

  async getRobots() {
    const record = await this.prisma.robotsSettings.findUnique({
      where: { id: 'default' },
    });
    return { content: normalizeRobotsContent(record?.content) };
  }

  async updateRobots(dto: UpdateRobotsDto) {
    return this.prisma.robotsSettings.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        content: normalizeRobotsContent(dto.content),
      },
      update: {
        content: normalizeRobotsContent(dto.content),
      },
    });
  }

  async listCollections(includeInactive = false) {
    return this.prisma.seoCollection.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        category: { select: { id: true, title: true, slug: true } },
        _count: { select: { tagTiles: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findCollectionBySlug(slug: string) {
    const collection = await this.prisma.seoCollection.findFirst({
      where: { slug, isActive: true },
      include: {
        category: { select: { id: true, title: true, slug: true } },
      },
    });
    if (!collection) {
      throw new HttpException('SEO collection not found', HttpStatus.NOT_FOUND);
    }
    return collection;
  }

  async createCollection(dto: UpsertSeoCollectionDto) {
    const data = await this.collectionData(dto);
    await this.ensureCollectionSlugAvailable(data.slug);
    return this.prisma.seoCollection.create({ data });
  }

  async updateCollection(id: string, dto: UpsertSeoCollectionDto) {
    const data = await this.collectionData(dto);
    await this.ensureCollectionSlugAvailable(data.slug, id);
    return this.prisma.seoCollection.update({ where: { id }, data });
  }

  async removeCollection(id: string) {
    await this.prisma.seoCollection.delete({ where: { id } });
    return { id };
  }

  async listTagTiles(includeInactive = false, categoryId?: string) {
    const normalizedCategoryId = this.cleanOptionalString(categoryId);
    return this.prisma.seoTagTile.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(normalizedCategoryId ? { categoryId: normalizedCategoryId } : {}),
      },
      include: {
        category: { select: { id: true, title: true, slug: true } },
        collection: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async createTagTile(dto: UpsertSeoTagTileDto) {
    return this.prisma.seoTagTile.create({ data: await this.tagTileData(dto) });
  }

  async updateTagTile(id: string, dto: UpsertSeoTagTileDto) {
    return this.prisma.seoTagTile.update({
      where: { id },
      data: await this.tagTileData(dto),
    });
  }

  async removeTagTile(id: string) {
    await this.prisma.seoTagTile.delete({ where: { id } });
    return { id };
  }

  async listTemplates() {
    const templates = await this.prisma.seoTemplate.findMany({
      orderBy: { type: 'asc' },
    });
    const byType = new Map(templates.map((template) => [template.type, template]));

    return SEO_PAGE_TYPES.map((type) => ({
      type,
      titleTemplate: null,
      descriptionTemplate: null,
      h1Template: null,
      ...byType.get(type),
    }));
  }

  async updateTemplate(type: SeoPageType, dto: UpdateSeoTemplateDto) {
    return this.prisma.seoTemplate.upsert({
      where: { type },
      create: {
        type,
        titleTemplate: dto.titleTemplate,
        descriptionTemplate: dto.descriptionTemplate,
        h1Template: dto.h1Template,
      },
      update: {
        titleTemplate: dto.titleTemplate,
        descriptionTemplate: dto.descriptionTemplate,
        h1Template: dto.h1Template,
      },
    });
  }

  async listStaticPages() {
    const records = await this.prisma.staticPageSeo.findMany({
      orderBy: { path: 'asc' },
    });
    const byPath = new Map(records.map((record) => [record.path, record]));

    const defaultRows = DEFAULT_STATIC_PAGES.map((page) => ({
      id: null,
      path: page.path,
      name: page.title,
      title: page.title,
      seoTitle: null,
      seoDescription: null,
      seoH1: null,
      isActive: true,
      createdAt: null,
      updatedAt: null,
      ...byPath.get(page.path),
    }));

    const defaultPaths = new Set(DEFAULT_STATIC_PAGES.map((page) => page.path));
    const customRows = records.filter((record) => !defaultPaths.has(record.path));

    return [...defaultRows, ...customRows];
  }

  async findStaticPage(path: string) {
    const normalizedPath = this.normalizePath(path);
    const record = await this.prisma.staticPageSeo.findUnique({
      where: { path: normalizedPath },
    });
    if (record) return record;

    const defaultPage = DEFAULT_STATIC_PAGES.find(
      (page) => page.path === normalizedPath,
    );
    if (!defaultPage) return null;

    return {
      id: null,
      path: defaultPage.path,
      name: defaultPage.title,
      title: defaultPage.title,
      seoTitle: null,
      seoDescription: null,
      seoH1: null,
      isActive: true,
      createdAt: null,
      updatedAt: null,
    };
  }

  async updateStaticPage(dto: UpdateStaticPageSeoDto) {
    const path = this.normalizePath(dto.path);

    return this.prisma.staticPageSeo.upsert({
      where: { path },
      create: {
        path,
        name: dto.name,
        title: dto.title,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        seoH1: dto.seoH1,
        isActive: dto.isActive ?? true,
      },
      update: {
        name: dto.name,
        title: dto.title,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
        seoH1: dto.seoH1,
        isActive: dto.isActive,
      },
    });
  }
}
