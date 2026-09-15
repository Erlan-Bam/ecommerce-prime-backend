import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/services/prisma.service';
import { UpsertSeoTagTileDto } from './dto';

type TagTileCategoryRow = {
  tagTileId: string;
  id: string;
  title: string;
  slug: string;
};

@Injectable()
export class SeoTagTileService {
  constructor(private readonly prisma: PrismaService) {}

  private cleanOptionalString(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private normalizeCategoryIds(dto: UpsertSeoTagTileDto): string[] {
    const requested = dto.categoryIds?.length
      ? dto.categoryIds
      : dto.categoryId
        ? [dto.categoryId]
        : [];

    return Array.from(
      new Set(requested.map((id) => id.trim()).filter(Boolean)),
    );
  }

  private async ensureCategoriesExist(categoryIds: string[]) {
    if (categoryIds.length === 0) {
      throw new HttpException(
        'At least one tag tile category is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const categories = await this.prisma.category.findMany({
      where: {
        id: { in: categoryIds },
        isDeleted: false,
      },
      select: { id: true },
    });

    if (categories.length !== categoryIds.length) {
      throw new HttpException('Category not found', HttpStatus.BAD_REQUEST);
    }
  }

  private async ensureCollectionExists(collectionId?: string | null) {
    const normalized = this.cleanOptionalString(collectionId);
    if (!normalized) return null;

    const collection = await this.prisma.seoCollection.findUnique({
      where: { id: normalized },
      select: { id: true },
    });
    if (!collection) {
      throw new HttpException(
        'SEO collection not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    return collection.id;
  }

  private async prepare(dto: UpsertSeoTagTileDto) {
    const title = dto.title.trim();
    const collectionId = await this.ensureCollectionExists(dto.collectionId);
    const url = this.cleanOptionalString(dto.url);
    const categoryIds = this.normalizeCategoryIds(dto);

    if (!title || (!collectionId && !url)) {
      throw new HttpException(
        'Tag tile title and destination are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.ensureCategoriesExist(categoryIds);

    return {
      categoryIds,
      data: {
        title,
        image: this.cleanOptionalString(dto.image),
        // Keep the first category in the old column so older code/data exports
        // remain compatible during the transition to multi-category tiles.
        categoryId: categoryIds[0],
        collectionId,
        url,
        isActive: dto.isActive ?? true,
        sortOrder: Number.isFinite(dto.sortOrder) ? Number(dto.sortOrder) : 0,
      },
    };
  }

  private async replaceCategoryLinks(tagTileId: string, categoryIds: string[]) {
    await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM "SeoTagTileCategory" WHERE "tagTileId" = ${tagTileId}`,
    );

    for (const categoryId of categoryIds) {
      await this.prisma.$executeRaw(
        Prisma.sql`INSERT INTO "SeoTagTileCategory" ("tagTileId", "categoryId") VALUES (${tagTileId}, ${categoryId}) ON CONFLICT DO NOTHING`,
      );
    }
  }

  private async attachCategories<T extends { id: string; category?: any }>(
    tiles: T[],
  ) {
    if (tiles.length === 0) return [];

    const ids = tiles.map((tile) => tile.id);
    const rows = await this.prisma.$queryRaw<TagTileCategoryRow[]>(
      Prisma.sql`
        SELECT link."tagTileId", category."id", category."title", category."slug"
        FROM "SeoTagTileCategory" link
        JOIN "Category" category ON category."id" = link."categoryId"
        WHERE link."tagTileId" IN (${Prisma.join(ids)})
        ORDER BY category."title" ASC
      `,
    );

    const byTile = new Map<string, Array<{ id: string; title: string; slug: string }>>();
    rows.forEach((row) => {
      const values = byTile.get(row.tagTileId) || [];
      values.push({ id: row.id, title: row.title, slug: row.slug });
      byTile.set(row.tagTileId, values);
    });

    return tiles.map((tile) => {
      const categories = byTile.get(tile.id) || (tile.category ? [tile.category] : []);
      return {
        ...tile,
        categoryIds: categories.map((category) => category.id),
        categories,
      };
    });
  }

  async list(includeInactive = false, categoryId?: string) {
    const normalizedCategoryId = this.cleanOptionalString(categoryId);
    let mappedIds: string[] = [];

    if (normalizedCategoryId) {
      const rows = await this.prisma.$queryRaw<Array<{ tagTileId: string }>>(
        Prisma.sql`SELECT "tagTileId" FROM "SeoTagTileCategory" WHERE "categoryId" = ${normalizedCategoryId}`,
      );
      mappedIds = rows.map((row) => row.tagTileId);
    }

    const tiles = await this.prisma.seoTagTile.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(normalizedCategoryId
          ? {
              OR: [
                { id: { in: mappedIds } },
                // Legacy fallback for databases where the migration has not
                // backfilled an old row yet.
                { categoryId: normalizedCategoryId },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { id: true, title: true, slug: true } },
        collection: {
          select: { id: true, name: true, slug: true, isActive: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });

    return this.attachCategories(tiles);
  }

  async create(dto: UpsertSeoTagTileDto) {
    const prepared = await this.prepare(dto);
    const tile = await this.prisma.seoTagTile.create({ data: prepared.data });
    await this.replaceCategoryLinks(tile.id, prepared.categoryIds);
    return (await this.list(true)).find((item) => item.id === tile.id);
  }

  async update(id: string, dto: UpsertSeoTagTileDto) {
    const prepared = await this.prepare(dto);
    await this.prisma.seoTagTile.update({
      where: { id },
      data: prepared.data,
    });
    await this.replaceCategoryLinks(id, prepared.categoryIds);
    return (await this.list(true)).find((item) => item.id === id);
  }

  async remove(id: string) {
    await this.prisma.seoTagTile.delete({ where: { id } });
    return { id };
  }
}
