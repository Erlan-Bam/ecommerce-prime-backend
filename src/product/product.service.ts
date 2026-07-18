import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/services/prisma.service';
import { ProductCacheService } from './services/cache.service';
import { inferNonAppleDeviceBrandFromProductName } from '../shared/lib/catalog-classification';
import { normalizeRelatedProductIds } from '../seo/seo-management';
import {
  CreateProductVariantGroupDto,
  CreateProductDto,
  UpdateProductVariantGroupDto,
  UpdateProductDto,
  ProductFilterDto,
  ProductSortBy,
  BulkUpdateProductCategoriesDto,
  ApplyCatalogCleanupDto,
} from './dto';

const TECHNICAL_ATTRIBUTE_NAMES = new Set([
  'id оффера',
  'группа оффера',
  'категория источника',
  'путь источника',
  'source id',
  'source slug',
  'offer id',
  'offer group',
]);

const CONFIGURATION_ATTRIBUTE_NAMES = new Set([
  'конфигурации',
  'конфигурации товара',
  'конфигурации цены',
  'variant configurations',
  'product configurations',
  'configurations',
]);

const MODIFICATION_ATTRIBUTE_NAMES = [
  'Модификация',
  'Параметр: Модификация',
  'В плитку: Модификация',
];

type CatalogFacetDefinition = {
  label: string;
  aliases: string[];
};

// These are shopper-facing characteristics. Source feeds contain dozens of
// technical fields, which are useful on a product page but not in a catalog sidebar.
const CATALOG_FACET_DEFINITIONS: CatalogFacetDefinition[] = [
  {
    label: 'Объём памяти',
    aliases: [
      'объём памяти',
      'объем памяти',
      'обьем памяти',
      'память',
      'ёмкость памяти',
      'емкость памяти',
      'встроенная память',
    ],
  },
  {
    label: 'Оперативная память',
    aliases: [
      'объём оперативной памяти',
      'объем оперативной памяти',
      'обьем оперативной памяти',
      'оперативная память',
      'ram',
    ],
  },
  {
    label: 'Цвет',
    aliases: ['цвет', 'color'],
  },
  {
    label: 'SIM-карта',
    aliases: ['sim', 'количество sim', 'количество сим', 'сим'],
  },
  {
    label: 'Диагональ экрана',
    aliases: ['диагональ экрана', 'диагональ', 'размер экрана'],
  },
  {
    label: 'Модификация',
    aliases: ['модификация'],
  },
];

const EXCLUDED_DESCENDANT_SLUGS_BY_ROOT_SLUG: Record<string, Set<string>> = {
  apple: new Set(['aksessuary-1']),
  naushniki: new Set([
    'magssory',
    'chehly-dlya-airpods',
    'uniq-1',
    'vygodnye-predlozheniya-1',
  ]),
};

type ProductListCandidate = {
  id: string;
  name: string;
  attributes?: Array<{ name: string; value: string }>;
};

type CatalogCategoryNode = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
};

type CatalogCleanupTarget = {
  category: CatalogCategoryNode;
  reason: string;
};

type AccessoryCleanupSignals = {
  hasCase: boolean;
  hasGlass: boolean;
  hasCable: boolean;
  hasCharger: boolean;
  hasStrap: boolean;
};

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: ProductCacheService,
  ) {}

  private cleanOptionalString(value: string | undefined | null): string | null {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private enrichProductVariantGroup<T>(product: T): T {
    const productWithGroup = product as any;
    if (!productWithGroup?.variantGroup?.products) {
      return product;
    }

    return {
      ...productWithGroup,
      variantGroup: {
        ...productWithGroup.variantGroup,
        products: productWithGroup.variantGroup.products.map((linkedProduct: any) => {
          const { productStock, ...rest } = linkedProduct;
          return {
            ...rest,
            totalStock: (productStock || []).reduce(
              (sum: number, stock: { stockCount?: number | null }) =>
                sum + (stock.stockCount || 0),
              0,
            ),
          };
        }),
      },
    } as T;
  }

  private enrichRelatedProducts<T>(product: T): T {
    const productWithRelations = product as any;
    if (!Array.isArray(productWithRelations?.relatedProducts)) {
      return product;
    }

    return {
      ...productWithRelations,
      relatedProducts: productWithRelations.relatedProducts.map((relation: any) => {
        const { productStock, ...targetProduct } = relation.targetProduct || {};
        const totalStock = (productStock || []).reduce(
          (sum: number, stock: { stockCount?: number | null }) =>
            sum + (stock.stockCount || 0),
          0,
        );

        return {
          ...relation,
          targetProduct: {
            ...targetProduct,
            totalStock,
          },
        };
      }),
    } as T;
  }

  private getRelatedProductsInclude() {
    return {
      orderBy: { sortOrder: 'asc' as const },
      include: {
        targetProduct: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            price: true,
            oldPrice: true,
            isActive: true,
            isOnSale: true,
            createdAt: true,
            images: {
              select: { id: true, url: true, alt: true, sortOrder: true },
              orderBy: { sortOrder: 'asc' as const },
            },
            productStock: {
              select: { stockCount: true },
            },
          },
        },
      },
    };
  }

  private async ensureRelatedProductsExist(productIds: string[]) {
    if (productIds.length === 0) return;

    const count = await this.prisma.product.count({
      where: {
        id: { in: productIds },
        isDeleted: false,
      },
    });

    if (count !== productIds.length) {
      throw new HttpException(
        'One or more related products were not found',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private getProductVariantGroupSelect(): Prisma.ProductVariantGroupSelect {
    return {
      id: true,
      name: true,
      products: {
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          oldPrice: true,
          isActive: true,
          variantColor: true,
          variantMemory: true,
          variantSim: true,
          images: {
            select: { id: true, url: true, alt: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
          attributes: {
            select: { id: true, name: true, value: true },
          },
          productStock: {
            select: { stockCount: true },
          },
        },
        orderBy: [
          { variantMemory: 'asc' },
          { variantColor: 'asc' },
          { variantSim: 'asc' },
          { name: 'asc' },
        ],
      },
    };
  }

  async findVariantGroups(search?: string, limit = 50) {
    const cleanSearch = search?.trim();
    const cleanLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    return this.prisma.productVariantGroup.findMany({
      where: cleanSearch
        ? { name: { contains: cleanSearch, mode: 'insensitive' } }
        : undefined,
      take: cleanLimit,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }

  async createVariantGroup(dto: CreateProductVariantGroupDto) {
    return this.prisma.productVariantGroup.create({
      data: { name: dto.name.trim() },
    });
  }

  async findVariantGroup(id: string) {
    const group = await this.prisma.productVariantGroup.findUnique({
      where: { id },
      select: this.getProductVariantGroupSelect(),
    });

    if (!group) {
      throw new HttpException('Variant group not found', HttpStatus.NOT_FOUND);
    }

    return (this.enrichProductVariantGroup({ variantGroup: group }) as any)
      .variantGroup;
  }

  async updateVariantGroup(id: string, dto: UpdateProductVariantGroupDto) {
    return this.prisma.productVariantGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
      },
    });
  }

  async deleteVariantGroup(id: string) {
    const existing = await this.prisma.productVariantGroup.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new HttpException('Variant group not found', HttpStatus.NOT_FOUND);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const unlinked = await tx.product.updateMany({
        where: { variantGroupId: id },
        data: { variantGroupId: null },
      });

      await tx.productVariantGroup.delete({
        where: { id },
      });

      return {
        id,
        unlinkedProducts: unlinked.count,
      };
    });

    await this.invalidateProductCaches();

    return result;
  }

  private generateSlug(name: string): string {
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
    return name
      .toLowerCase()
      .split('')
      .map((ch) => translitMap[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private async generateUniqueSlug(
    name: string,
    excludeProductId?: string,
  ): Promise<string> {
    const baseSlug = this.generateSlug(name) || 'product';
    let slug = baseSlug;
    let suffix = 2;

    while (true) {
      const existingProduct = await this.prisma.product.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existingProduct || existingProduct.id === excludeProductId) {
        return slug;
      }

      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
  }

  private normalizeText(value: string): string {
    return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  private normalizeAttributeName(name: string): string | null {
    const cleanName = name.replace(/\s+/g, ' ').trim();
    if (!cleanName) return null;

    const withoutPrefix = cleanName.replace(/^параметр\s*:\s*/i, '').trim();
    const finalName = withoutPrefix || cleanName;
    if (!finalName) return null;

    const normalized = this.normalizeText(finalName);
    if (TECHNICAL_ATTRIBUTE_NAMES.has(normalized)) {
      return null;
    }

    return finalName;
  }

  private getCatalogFacetDefinition(
    attributeName: string,
  ): CatalogFacetDefinition | null {
    const normalizedName = this.normalizeText(attributeName);

    return (
      CATALOG_FACET_DEFINITIONS.find((facet) =>
        facet.aliases.some(
          (alias) => this.normalizeText(alias) === normalizedName,
        ),
      ) ?? null
    );
  }

  private getCatalogFacetName(attributeName: string): string | null {
    return this.getCatalogFacetDefinition(attributeName)?.label ?? null;
  }

  private normalizeCatalogFacetValue(
    facetName: string,
    value: string,
  ): string {
    const cleanValue = value.replace(/\s+/g, ' ').trim();
    if (facetName !== 'Объём памяти' && facetName !== 'Оперативная память') {
      return cleanValue;
    }

    const capacityMatch = cleanValue.match(
      /^(\d+(?:[.,]\d+)?)\s*(тб|tb|гб|gb|мб|mb)$/i,
    );
    if (!capacityMatch) return cleanValue;

    const valueNumber = capacityMatch[1].replace(',', '.');
    const unit = capacityMatch[2].toLowerCase();
    const unitLabel =
      unit === 'tb' || unit === 'тб'
        ? 'ТБ'
        : unit === 'mb' || unit === 'мб'
          ? 'МБ'
          : 'ГБ';

    return `${valueNumber} ${unitLabel}`;
  }

  private getCatalogFacetValueSortKey(
    facetName: string,
    value: string,
  ): number | null {
    if (facetName !== 'Объём памяти' && facetName !== 'Оперативная память') {
      return null;
    }

    const capacityMatch = value.match(
      /^(\d+(?:[.,]\d+)?)\s*(тб|tb|гб|gb|мб|mb)$/i,
    );
    if (!capacityMatch) return null;

    const size = Number(capacityMatch[1].replace(',', '.'));
    if (!Number.isFinite(size)) return null;

    switch (capacityMatch[2].toLowerCase()) {
      case 'тб':
      case 'tb':
        return size * 1024 * 1024;
      case 'гб':
      case 'gb':
        return size * 1024;
      case 'мб':
      case 'mb':
        return size;
      default:
        return null;
    }
  }

  private sortCatalogFacetValues(facetName: string, values: string[]): string[] {
    return [...values].sort((left, right) => {
      const leftKey = this.getCatalogFacetValueSortKey(facetName, left);
      const rightKey = this.getCatalogFacetValueSortKey(facetName, right);

      if (leftKey !== null && rightKey !== null && leftKey !== rightKey) {
        return leftKey - rightKey;
      }
      if (leftKey !== null && rightKey === null) return -1;
      if (leftKey === null && rightKey !== null) return 1;

      return left.localeCompare(right, 'ru', { numeric: true });
    });
  }

  private sanitizeAttributes(
    attributes:
      | Array<{ id?: string; name: string; value: string }>
      | undefined
      | null,
  ): Array<{ id?: string; name: string; value: string }> {
    if (!attributes || attributes.length === 0) {
      return [];
    }

    const unique = new Map<
      string,
      { id?: string; name: string; value: string }
    >();
    for (const attr of attributes) {
      const name = this.normalizeAttributeName(attr.name);
      const value = attr.value?.toString().trim();
      if (!name || !value) continue;

      const key = `${this.normalizeText(name)}::${this.normalizeText(value)}`;
      if (!unique.has(key)) {
        unique.set(key, {
          ...(attr.id ? { id: attr.id } : {}),
          name,
          value,
        });
      }
    }

    return Array.from(unique.values());
  }

  private mapAttributeQueryNames(name: string): string[] {
    const normalized = this.normalizeAttributeName(name);
    if (!normalized) return [];

    const facet = this.getCatalogFacetDefinition(normalized);
    const attributeNames = facet ? facet.aliases : [normalized];
    const candidates = new Set<string>();

    attributeNames.forEach((attributeName) => {
      candidates.add(attributeName);
      candidates.add(`Параметр: ${attributeName}`);
      candidates.add(`В плитку: ${attributeName}`);
    });

    return Array.from(candidates);
  }

  private mapAttributeQueryValues(value: string): string[] {
    const cleanValue = value.replace(/\s+/g, ' ').trim();
    if (!cleanValue) return [];

    const compactValue = cleanValue.replace(/\s+/g, '');
    const candidates = new Set<string>([cleanValue, compactValue]);
    const compactLower = compactValue.toLowerCase();

    const simMatch = compactLower.match(/^(\d+)(sim|сим)$/i);
    if (simMatch) {
      candidates.add(`${simMatch[1]} SIM`);
      candidates.add(`${simMatch[1]}SIM`);
      candidates.add(`${simMatch[1]} сим`);
    }

    if (['esim', 'e-sim', 'eсим', 'есим'].includes(compactLower)) {
      candidates.add('eSIM');
      candidates.add('e-SIM');
      candidates.add('E SIM');
      candidates.add('ESIM');
      candidates.add('еSIM');
      candidates.add('е-SIM');
      candidates.add('е сим');
      candidates.add('есим');
    }

    const capacityMatch = cleanValue.match(
      /^(\d+(?:[.,]\d+)?)\s*(тб|tb|гб|gb|мб|mb)$/i,
    );
    if (capacityMatch) {
      const amount = capacityMatch[1];
      const unit = capacityMatch[2].toLowerCase();
      const variants =
        unit === 'тб' || unit === 'tb'
          ? ['ТБ', 'TB']
          : unit === 'мб' || unit === 'mb'
            ? ['МБ', 'MB']
            : ['ГБ', 'GB'];

      variants.forEach((unitVariant) => {
        candidates.add(`${amount} ${unitVariant}`);
        candidates.add(`${amount}${unitVariant}`);
      });
    }

    return Array.from(candidates);
  }

  private isConfigurationAttributeName(name: string): boolean {
    return CONFIGURATION_ATTRIBUTE_NAMES.has(this.normalizeText(name));
  }

  private getListingDedupeKey(product: ProductListCandidate): string {
    return this.normalizeText(product.name);
  }

  private getModificationPreferenceRank(product: ProductListCandidate): number {
    const modification = product.attributes?.find((attribute) =>
      MODIFICATION_ATTRIBUTE_NAMES.some(
        (name) =>
          this.normalizeText(attribute.name) === this.normalizeText(name),
      ),
    );
    const value = this.normalizeText(modification?.value || '');

    if (value.includes('nano') && value.includes('esim')) return 0;
    if (value.includes('nano')) return 1;
    if (value.includes('esim') || value.includes('есим')) return 2;

    return 3;
  }

  private normalizeCatalogText(value: string | null | undefined): string {
    return (value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[«»"'()[\],.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getCategoryPath(
    category: CatalogCategoryNode | undefined,
    categoryById: Map<string, CatalogCategoryNode>,
  ): CatalogCategoryNode[] {
    const path: CatalogCategoryNode[] = [];
    const visited = new Set<string>();
    let current = category;

    while (current && !visited.has(current.id)) {
      path.unshift(current);
      visited.add(current.id);
      current = current.parentId
        ? categoryById.get(current.parentId)
        : undefined;
    }

    return path;
  }

  private isAppleAccessoryPath(path: CatalogCategoryNode[]): boolean {
    const pathText = this.normalizeCatalogText(
      path.map((category) => category.title).join(' > '),
    );

    return pathText.includes('apple') && pathText.includes('аксессуары apple');
  }

  private findCategoryByTerms(
    categories: CatalogCategoryNode[],
    categoryById: Map<string, CatalogCategoryNode>,
    options: {
      titleIncludes?: string[];
      slugIncludes?: string[];
      pathIncludes?: string[];
      pathExcludes?: string[];
      preferDeep?: boolean;
    },
  ): CatalogCategoryNode | null {
    const titleTerms = (options.titleIncludes || []).map((term) =>
      this.normalizeCatalogText(term),
    );
    const slugTerms = (options.slugIncludes || []).map((term) =>
      this.normalizeCatalogText(term),
    );
    const pathTerms = (options.pathIncludes || []).map((term) =>
      this.normalizeCatalogText(term),
    );
    const pathExcludes = (options.pathExcludes || []).map((term) =>
      this.normalizeCatalogText(term),
    );

    const matches = categories
      .map((category) => {
        const path = this.getCategoryPath(category, categoryById);
        const normalizedTitle = this.normalizeCatalogText(category.title);
        const normalizedSlug = this.normalizeCatalogText(category.slug);
        const normalizedPath = this.normalizeCatalogText(
          path.map((item) => item.title).join(' > '),
        );

        const hasTitle =
          titleTerms.length === 0 ||
          titleTerms.some((term) => normalizedTitle.includes(term));
        const hasSlug =
          slugTerms.length === 0 ||
          slugTerms.some((term) => normalizedSlug.includes(term));
        const hasPath =
          pathTerms.length === 0 ||
          pathTerms.every((term) => normalizedPath.includes(term));
        const hasExcludedPath = pathExcludes.some((term) =>
          normalizedPath.includes(term),
        );

        return {
          category,
          depth: path.length,
          matches: hasTitle && hasSlug && hasPath && !hasExcludedPath,
        };
      })
      .filter((item) => item.matches)
      .sort((a, b) =>
        options.preferDeep ? b.depth - a.depth : a.depth - b.depth,
      );

    return matches[0]?.category ?? null;
  }

  private findExactIphoneAccessoryCategory(
    iphoneModel: string,
    categories: CatalogCategoryNode[],
    categoryById: Map<string, CatalogCategoryNode>,
  ): CatalogCategoryNode | null {
    const exactTitles = new Set(
      [`для ${iphoneModel}`, `аксессуары для ${iphoneModel}`].map((title) =>
        this.normalizeCatalogText(title),
      ),
    );

    const matches = categories
      .map((category) => {
        const path = this.getCategoryPath(category, categoryById);
        const normalizedTitle = this.normalizeCatalogText(category.title);
        return {
          category,
          path,
          normalizedTitle,
          matches:
            exactTitles.has(normalizedTitle) && this.isAppleAccessoryPath(path),
        };
      })
      .filter((item) => item.matches)
      .sort((a, b) => {
        const aTitleRank = a.normalizedTitle.startsWith('для ') ? 0 : 1;
        const bTitleRank = b.normalizedTitle.startsWith('для ') ? 0 : 1;
        if (aTitleRank !== bTitleRank) return aTitleRank - bTitleRank;
        return b.path.length - a.path.length;
      });

    return matches[0]?.category ?? null;
  }

  private detectIphoneCompatibilityModel(text: string): string | null {
    const models = [
      { terms: ['17 pro max'], label: 'iPhone 17 Pro Max' },
      { terms: ['17 pro'], label: 'iPhone 17 Pro' },
      { terms: ['17 air', 'iphone air'], label: 'iPhone Air' },
      { terms: ['17e'], label: 'iPhone 17e' },
      { terms: ['17'], label: 'iPhone 17' },
      { terms: ['16 pro max'], label: 'iPhone 16 Pro Max' },
      { terms: ['16 pro'], label: 'iPhone 16 Pro' },
      { terms: ['16 plus'], label: 'iPhone 16 Plus' },
      { terms: ['16e'], label: 'iPhone 16e' },
      { terms: ['16'], label: 'iPhone 16' },
      { terms: ['15 pro max'], label: 'iPhone 15 Pro Max' },
      { terms: ['15 pro'], label: 'iPhone 15 Pro' },
      { terms: ['15 plus'], label: 'iPhone 15 Plus' },
      { terms: ['15'], label: 'iPhone 15' },
      { terms: ['14 pro max'], label: 'iPhone 14 Pro Max' },
      { terms: ['14 pro'], label: 'iPhone 14 Pro' },
      { terms: ['14 plus'], label: 'iPhone 14 Plus' },
      { terms: ['14'], label: 'iPhone 14' },
      { terms: ['13 pro max'], label: 'iPhone 13 Pro Max' },
      { terms: ['13 pro'], label: 'iPhone 13 Pro' },
      { terms: ['13 mini'], label: 'iPhone 13 Mini' },
      { terms: ['13'], label: 'iPhone 13' },
      { terms: ['12 pro max'], label: 'iPhone 12 Pro Max' },
      { terms: ['12 pro'], label: 'iPhone 12 Pro' },
      { terms: ['12 mini'], label: 'iPhone 12 Mini' },
      { terms: ['12'], label: 'iPhone 12' },
    ];

    for (const model of models) {
      for (const term of model.terms) {
        const modelText = this.normalizeCatalogText(term);
        const ruModelText = modelText
          .replace(/pro/g, 'про')
          .replace(/max/g, 'макс');

        if (
          text.includes(`iphone ${modelText}`) ||
          text.includes(`айфон ${ruModelText}`) ||
          text.includes(modelText) ||
          text.includes(ruModelText)
        ) {
          return model.label;
        }
      }
    }

    return null;
  }

  private pickBeatsCatalogCleanupTarget(
    nameText: string,
    categories: CatalogCategoryNode[],
    categoryById: Map<string, CatalogCategoryNode>,
  ): CatalogCleanupTarget | null {
    const modelTargets: Array<{ terms: string[]; reason: string }> = [
      {
        terms: ['powerbeats pro 2'],
        reason: 'наушники Beats Powerbeats Pro 2',
      },
      { terms: ['studio pro'], reason: 'наушники Beats Studio Pro' },
      { terms: ['studio buds'], reason: 'наушники Beats Studio Buds' },
      { terms: ['fit pro'], reason: 'наушники Beats Fit Pro' },
    ];

    for (const target of modelTargets) {
      if (!target.terms.some((term) => nameText.includes(term))) continue;

      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: target.terms,
        pathIncludes: ['beats'],
        pathExcludes: ['apple'],
        preferDeep: true,
      });
      if (category) return { category, reason: target.reason };
    }

    const headphones = this.findCategoryByTerms(categories, categoryById, {
      titleIncludes: ['наушники'],
      pathIncludes: ['beats'],
      pathExcludes: ['apple'],
      preferDeep: true,
    });
    if (headphones) {
      return {
        category: headphones,
        reason: 'наушники Beats лежат не в Beats',
      };
    }

    const root = this.findCategoryByTerms(categories, categoryById, {
      titleIncludes: ['beats'],
      slugIncludes: ['beats'],
      pathExcludes: ['apple'],
    });
    return root
      ? { category: root, reason: 'товар Beats лежит не в ветке Beats' }
      : null;
  }

  private pickDeviceAccessoryCleanupTarget(
    deviceBrand: string,
    signals: AccessoryCleanupSignals,
    categories: CatalogCategoryNode[],
    categoryById: Map<string, CatalogCategoryNode>,
  ): CatalogCleanupTarget | null {
    const pathIncludes = [deviceBrand];
    const targetGroups: Array<{ titleIncludes: string[]; reason: string }> = [];

    if (signals.hasCase) {
      targetGroups.push({
        titleIncludes: ['чехлы', 'чехол', 'cases', 'case'],
        reason: `чехол ${deviceBrand} лежит не в ветке ${deviceBrand}`,
      });
    }

    if (signals.hasGlass) {
      targetGroups.push({
        titleIncludes: ['защитные стекла', 'стекла', 'пленки', 'пленка'],
        reason: `стекло/пленка ${deviceBrand} лежит не в ветке ${deviceBrand}`,
      });
    }

    if (signals.hasCable) {
      targetGroups.push({
        titleIncludes: ['кабели', 'кабель'],
        reason: `кабель ${deviceBrand} лежит не в ветке ${deviceBrand}`,
      });
    }

    if (signals.hasCharger) {
      targetGroups.push({
        titleIncludes: ['зарядные устройства', 'зарядки', 'адаптеры'],
        reason: `зарядка/адаптер ${deviceBrand} лежит не в ветке ${deviceBrand}`,
      });
    }

    if (signals.hasStrap) {
      targetGroups.push({
        titleIncludes: ['ремешки', 'ремешок'],
        reason: `ремешок ${deviceBrand} лежит не в ветке ${deviceBrand}`,
      });
    }

    targetGroups.push({
      titleIncludes: ['аксессуары'],
      reason: `аксессуар ${deviceBrand} лежит не в ветке ${deviceBrand}`,
    });

    for (const target of targetGroups) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: target.titleIncludes,
        pathIncludes,
        pathExcludes: ['apple'],
        preferDeep: true,
      });

      if (category) {
        return { category, reason: target.reason };
      }
    }

    return null;
  }

  private pickCatalogCleanupTarget(
    product: {
      name: string;
      description?: string | null;
      brand?: { name?: string | null; slug?: string | null } | null;
      categories?: Array<{
        isPrimary?: boolean;
        category?: CatalogCategoryNode | null;
      }>;
      attributes?: Array<{ name: string; value: string }>;
    },
    categories: CatalogCategoryNode[],
    categoryById: Map<string, CatalogCategoryNode>,
  ): CatalogCleanupTarget | null {
    const primaryCategory =
      (product.categories || []).find((item) => item.isPrimary)?.category ||
      product.categories?.[0]?.category ||
      null;
    const primaryPath = this.getCategoryPath(
      primaryCategory || undefined,
      categoryById,
    );
    const isAlreadyInAppleAccessoryChild =
      primaryPath.length > 2 && this.isAppleAccessoryPath(primaryPath);
    const currentPathText = this.normalizeCatalogText(
      (product.categories || [])
        .map((item) =>
          this.getCategoryPath(item.category || undefined, categoryById)
            .map((category) => category.title)
            .join(' > '),
        )
        .join(' | '),
    );
    const brandText = this.normalizeCatalogText(
      `${product.brand?.name || ''} ${product.brand?.slug || ''}`,
    );
    const nameText = this.normalizeCatalogText(product.name);
    const nameWithPathText = this.normalizeCatalogText(
      `${product.name} ${currentPathText}`,
    );
    const hasCase =
      /(чехол|чехлы|накладк)/i.test(nameText) ||
      (nameText.includes('case') && !nameText.includes('charging case'));
    const hasGlass =
      /(стекл|пленк|плёнк|гидрогел|screen protector|protective glass|protective film)/i.test(
        nameText,
      );
    const hasCable = /(кабель|cable|usb c|usb-c|type c|type-c|lightning)/i.test(
      nameText,
    );
    const hasCharger =
      /(зарядн|блок питания|адаптер питания|power adapter|magsafe charger|magsafe battery|аккумулятор|акб|power bank|battery)/i.test(
        nameText,
      );
    const hasStrap = /(ремеш|strap|браслет)/i.test(nameText);
    const nonAppleDeviceBrand = inferNonAppleDeviceBrandFromProductName(
      product.name,
      `${product.brand?.name || ''} ${product.brand?.slug || ''}`,
    );
    const hasNonAppleContext =
      Boolean(nonAppleDeviceBrand) ||
      /\b(android)\b/i.test(`${brandText} ${nameText}`);
    const hasAppleDeviceContext =
      /\b(apple|iphone|ipad|airpods|earpods|macbook|imac|mac mini|mac studio|mac pro)\b/i.test(
        `${brandText} ${nameText}`,
      ) ||
      nameText.includes('apple watch') ||
      nameText.includes('magic keyboard') ||
      nameText.includes('apple pencil');
    const hasAppleAccessoryContext =
      !hasNonAppleContext && /\b(magsafe|lightning)\b/i.test(nameText);
    const hasBeatsBrandOrName = /\bbeats\b/i.test(`${brandText} ${nameText}`);
    const isBeatsHeadphones =
      hasBeatsBrandOrName &&
      !hasCase &&
      /(наушник|headphone|earbud|studio|solo|fit|powerbeats|beats)/i.test(
        nameText,
      );

    if (isBeatsHeadphones) {
      return this.pickBeatsCatalogCleanupTarget(
        nameText,
        categories,
        categoryById,
      );
    }

    const hasNonAppleAccessoryContext =
      Boolean(nonAppleDeviceBrand) &&
      (hasCase || hasGlass || hasCable || hasCharger || hasStrap);

    if (nonAppleDeviceBrand && hasNonAppleAccessoryContext) {
      return this.pickDeviceAccessoryCleanupTarget(
        nonAppleDeviceBrand,
        {
          hasCase,
          hasGlass,
          hasCable,
          hasCharger,
          hasStrap,
        },
        categories,
        categoryById,
      );
    }

    const hasAppleContext =
      currentPathText.includes('apple') ||
      brandText.includes('apple') ||
      hasAppleDeviceContext ||
      hasAppleAccessoryContext;

    if (!hasAppleContext) {
      return null;
    }

    const hasKeyboard =
      /(клавиатур|keyboard|magic keyboard|trackpad|трекпад|мышь|mouse)/i.test(
        nameText,
      );
    const hasPencil = /(apple pencil|pencil|стилус)/i.test(nameText);
    const hasWatch = /(apple watch|watch series|watch ultra|watch se)/i.test(
      nameText,
    );
    const isAppleWatchDevice =
      /^apple watch\b/i.test(nameText) ||
      /\bwatch (series|ultra|se)\b/i.test(nameText);
    const hasAirPods = /(airpods|earpods)/i.test(nameText);
    const hasIpad = /(ipad|айпад)/i.test(nameWithPathText);
    const iphoneModel =
      this.detectIphoneCompatibilityModel(nameText) ||
      this.detectIphoneCompatibilityModel(currentPathText);

    if (hasWatch && hasStrap && !isAppleWatchDevice) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['ремешки'],
        pathIncludes: ['apple', 'аксессуары'],
        preferDeep: true,
      });
      if (category) return { category, reason: 'ремешок для Apple Watch' };
    }

    if (hasWatch && hasGlass) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['стекла для apple watch', 'стекла'],
        pathIncludes: ['apple', 'аксессуары'],
        preferDeep: true,
      });
      if (category)
        return { category, reason: 'стекло/пленка для Apple Watch' };
    }

    if (isAppleWatchDevice) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['часы apple watch'],
        pathIncludes: ['apple'],
      });
      if (category) return { category, reason: 'Apple Watch лежит не в часах' };
    }

    if ((hasCase || hasGlass) && iphoneModel) {
      const category = this.findExactIphoneAccessoryCategory(
        iphoneModel,
        categories,
        categoryById,
      );
      if (category) {
        return {
          category,
          reason: `${hasGlass ? 'стекло/пленка' : 'чехол'} для ${iphoneModel}`,
        };
      }
    }

    if (hasCase && hasIpad) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['чехлы'],
        pathIncludes: ['apple', 'планшеты'],
        preferDeep: true,
      });
      if (category) return { category, reason: 'чехол для iPad' };
    }

    if (hasGlass && hasIpad) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['защитные стекла', 'защитные стекла'],
        pathIncludes: ['apple', 'планшеты'],
        preferDeep: true,
      });
      if (category) return { category, reason: 'стекло/пленка для iPad' };
    }

    if (hasKeyboard || hasPencil) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: hasIpad
          ? ['стилусы и клавиатуры apple для ipad']
          : ['клавиатуры apple', 'клавиатуры', 'клавиатуры и мыши'],
        pathIncludes: ['apple'],
        preferDeep: true,
      });
      if (category) return { category, reason: 'клавиатура/стилус Apple' };
    }

    if (hasAirPods && !hasCase) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['наушники apple airpods и beats'],
        pathIncludes: ['apple'],
      });
      if (category)
        return { category, reason: 'AirPods/Beats лежат не в наушниках' };
    }

    if (hasCase && !isAlreadyInAppleAccessoryChild) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['чехлы apple', 'чехлы'],
        pathIncludes: ['apple', 'аксессуары'],
        preferDeep: true,
      });
      if (category) return { category, reason: 'чехол лежит не в аксессуарах' };
    }

    if (hasGlass && !isAlreadyInAppleAccessoryChild) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['защитные стекла'],
        pathIncludes: ['apple', 'аксессуары'],
        preferDeep: true,
      });
      if (category)
        return { category, reason: 'стекло/пленка лежит не в стеклах' };
    }

    if (hasCharger && !isAlreadyInAppleAccessoryChild) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['зарядные устройства apple', 'зарядные устройства'],
        pathIncludes: ['apple', 'аксессуары'],
        preferDeep: true,
      });
      if (category)
        return { category, reason: 'зарядка/адаптер лежит не в зарядках' };
    }

    if (hasCable && !isAlreadyInAppleAccessoryChild) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['кабели apple', 'кабели'],
        pathIncludes: ['apple', 'аксессуары'],
        preferDeep: true,
      });
      if (category) return { category, reason: 'кабель лежит не в кабелях' };
    }

    if (
      currentPathText.includes('смартфоны apple iphone') &&
      (nameText.includes('для iphone') || nameText.includes('для айфон'))
    ) {
      const category = this.findCategoryByTerms(categories, categoryById, {
        titleIncludes: ['для iphone'],
        pathIncludes: ['apple', 'аксессуары'],
        preferDeep: true,
      });
      if (category)
        return { category, reason: 'подкатегория "для iPhone" лежит в iPhone' };
    }

    return null;
  }

  private collapseDuplicateProductIds(
    products: ProductListCandidate[],
  ): string[] {
    const byName = new Map<string, ProductListCandidate>();

    for (const product of products) {
      const key = this.getListingDedupeKey(product);
      const existing = byName.get(key);

      if (!existing) {
        byName.set(key, product);
        continue;
      }

      if (
        this.getModificationPreferenceRank(product) <
        this.getModificationPreferenceRank(existing)
      ) {
        byName.set(key, product);
      }
    }

    return Array.from(byName.values()).map((product) => product.id);
  }

  async create(dto: CreateProductDto) {
    try {
      this.logger.log(`Creating product: ${dto.name}`);

      const slug = await this.generateUniqueSlug(dto.name);
      const attributes = this.sanitizeAttributes(dto.attributes);
      const variantGroupId = this.cleanOptionalString(dto.variantGroupId);
      const relatedProductIds = normalizeRelatedProductIds('', dto.relatedProductIds);
      await this.ensureRelatedProductsExist(relatedProductIds);

      const product = await this.prisma.product.create({
        data: {
          ...(dto.brandId && { brand: { connect: { id: dto.brandId } } }),
          ...(variantGroupId && {
            variantGroup: { connect: { id: variantGroupId } },
          }),
          variantColor: this.cleanOptionalString(dto.variantColor),
          variantMemory: this.cleanOptionalString(dto.variantMemory),
          variantSim: this.cleanOptionalString(dto.variantSim),
          name: dto.name,
          slug,
          description: dto.description,
          seoTitle: dto.seoTitle,
          seoDescription: dto.seoDescription,
          seoH1: dto.seoH1,
          price: dto.price,
          oldPrice: dto.oldPrice,
          isActive: dto.isActive ?? true,
          isOnSale: dto.isOnSale ?? false,
          isPopular: dto.isPopular ?? false,
          categories: {
            create: dto.categoryIds.map((catId, idx) => ({
              categoryId: catId,
              isPrimary: idx === 0,
            })),
          },
          images: dto.images
            ? {
                create: dto.images.map((img, idx) => ({
                  url: img.url,
                  alt: img.alt,
                  sortOrder: img.sortOrder ?? idx,
                })),
              }
            : undefined,
          attributes:
            attributes.length > 0
              ? {
                  create: attributes.map((attr) => ({
                    name: attr.name,
                    value: attr.value,
                  })),
                }
              : undefined,
        },
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
          brand: true,
          variantGroup: {
            select: this.getProductVariantGroupSelect(),
          },
          images: { orderBy: { sortOrder: 'asc' } },
          attributes: true,
          productStock: {
            include: {
              pickupPoint: { select: { id: true, address: true } },
            },
          },
        },
      });

      if (relatedProductIds.length > 0) {
        await this.prisma.productRelation.createMany({
          data: relatedProductIds.map((targetProductId, sortOrder) => ({
            sourceProductId: product.id,
            targetProductId,
            sortOrder,
          })),
        });
      }

      await this.invalidateProductCaches();
      this.logger.log(`Created product ${product.id}`);

      return product;
    } catch (error) {
      this.logger.error(
        `Error creating product: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(filter: ProductFilterDto) {
    try {
      this.logger.log(
        `Finding all products with filter: ${JSON.stringify(filter)}`,
      );

      const cacheKey = `products:${JSON.stringify(filter)}`;
      const cached = await this.cacheService.getCachedProducts(cacheKey);
      if (cached) {
        this.logger.log(`Cache hit: ${cacheKey}`);
        return cached;
      }

      const requestedPage = Number(filter.page ?? 1);
      const requestedLimit = Number(filter.limit ?? 20);
      const page = Number.isFinite(requestedPage)
        ? Math.max(1, requestedPage)
        : 1;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(200, Math.max(1, requestedLimit))
        : 20;
      const skip = (page - 1) * limit;

      const where = await this.buildWhereClause(filter);
      const orderBy = this.buildOrderByClause(filter.sortBy);

      const productListSelect = {
        id: true,
        name: true,
        slug: true,
        price: true,
        oldPrice: true,
        isActive: true,
        isOnSale: true,
        isPopular: true,
        brandId: true,
        variantGroupId: true,
        variantColor: true,
        variantMemory: true,
        variantSim: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
        seoH1: true,
        viewCount: true,
        createdAt: true,
        brand: { select: { id: true, name: true, slug: true } },
        variantGroup: { select: { id: true, name: true } },
        categories: {
          select: {
            categoryId: true,
            isPrimary: true,
            category: { select: { id: true, title: true, slug: true } },
          },
          orderBy: { isPrimary: 'desc' },
        },
        images: {
          select: { id: true, url: true, alt: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
        attributes: {
          select: { id: true, name: true, value: true },
          take: 4,
        },
      } as const;

      const shouldCollapseDuplicates = filter.includeInactive !== true;
      let products: any[];
      let total: number;

      if (shouldCollapseDuplicates) {
        const candidates = await this.prisma.product.findMany({
          where,
          orderBy,
          select: {
            id: true,
            name: true,
            attributes: {
              where: { name: { in: MODIFICATION_ATTRIBUTE_NAMES } },
              select: { name: true, value: true },
            },
          },
        });
        const collapsedIds = this.collapseDuplicateProductIds(candidates);
        const pageIds = collapsedIds.slice(skip, skip + limit);
        const orderIndex = new Map(pageIds.map((id, index) => [id, index]));

        total = collapsedIds.length;
        products =
          pageIds.length > 0
            ? await this.prisma.product.findMany({
                where: { id: { in: pageIds } },
                select: productListSelect,
              })
            : [];
        products.sort(
          (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0),
        );
      } else {
        [products, total] = await Promise.all([
          this.prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy,
            select: productListSelect,
          }),
          this.prisma.product.count({ where }),
        ]);
      }

      const productIds = products.map((product) => product.id);
      const [stockRows, reviewRows] =
        productIds.length > 0
          ? await Promise.all([
              this.prisma.productStock.groupBy({
                by: ['productId'],
                where: { productId: { in: productIds } },
                _sum: { stockCount: true },
              }),
              this.prisma.review.groupBy({
                by: ['productId'],
                where: { productId: { in: productIds } },
                _avg: { rating: true },
                _count: { rating: true },
              }),
            ])
          : [[], []];

      const stockByProductId = new Map(
        stockRows.map((row) => [row.productId, row._sum.stockCount ?? 0]),
      );
      const reviewsByProductId = new Map(
        reviewRows.map((row) => [
          row.productId,
          {
            avg: row._avg.rating ?? 0,
            count: row._count.rating ?? 0,
          },
        ]),
      );

      const productsWithRating = products.map((product) => {
        const sanitizedAttributes = this.sanitizeAttributes(
          product.attributes,
        ).filter(
          (attribute) => !this.isConfigurationAttributeName(attribute.name),
        );
        const reviewStats = reviewsByProductId.get(product.id);
        const averageRating = reviewStats?.avg ?? 0;
        const reviewCount = reviewStats?.count ?? 0;
        const totalStock = stockByProductId.get(product.id) ?? 0;

        return {
          ...product,
          attributes: sanitizedAttributes,
          rating: Math.round(averageRating * 10) / 10,
          reviewCount,
          totalStock,
        };
      });

      const result = {
        data: productsWithRating,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      };

      await this.cacheService.cacheProducts(cacheKey, result);
      this.logger.log(`Cached products result`);

      return result;
    } catch (error) {
      this.logger.error(
        `Error finding all products: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find products',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: string) {
    try {
      this.logger.log(`Finding product: ${id}`);

      const cached = await this.cacheService.getCachedProduct(id);
      if (cached) {
        this.logger.log(`Cache hit for product ${id}`);
        return cached;
      }

      const product = await this.prisma.product.findUnique({
        where: { id },
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
          brand: true,
          images: { orderBy: { sortOrder: 'asc' } },
          attributes: true,
          reviews: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          productStock: {
            include: {
              pickupPoint: {
                select: {
                  id: true,
                  address: true,
                  coords: true,
                  workingSchedule: true,
                  url: true,
                },
              },
            },
          },
          relatedProducts: this.getRelatedProductsInclude(),
        },
      });

      if (!product || product.isDeleted) {
        throw new HttpException(
          `Product with ID ${id} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      // Update view count
      await this.prisma.product.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });

      const ratings = product.reviews;
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
          : 0;

      const totalStock = product.productStock.reduce(
        (sum, s) => sum + s.stockCount,
        0,
      );

      const result = this.enrichProductVariantGroup(this.enrichRelatedProducts({
        ...product,
        attributes: this.sanitizeAttributes(product.attributes),
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: ratings.length,
        totalStock,
      }));

      await this.cacheService.cacheProduct(id, result);
      return result;
    } catch (error) {
      this.logger.error(
        `Error finding product ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findBySlug(slug: string) {
    try {
      this.logger.log(`Finding product by slug: ${slug}`);

      const product = await this.prisma.product.findFirst({
        where: {
          slug: {
            equals: slug,
            mode: 'insensitive',
          },
        },
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
          brand: true,
          variantGroup: {
            select: this.getProductVariantGroupSelect(),
          },
          images: { orderBy: { sortOrder: 'asc' } },
          attributes: true,
          reviews: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          productStock: {
            include: {
              pickupPoint: {
                select: {
                  id: true,
                  address: true,
                  coords: true,
                  workingSchedule: true,
                  url: true,
                },
              },
            },
          },
          relatedProducts: this.getRelatedProductsInclude(),
        },
      });

      if (!product || product.isDeleted) {
        throw new HttpException(`Product not found`, HttpStatus.NOT_FOUND);
      }

      await this.prisma.product.update({
        where: { id: product.id },
        data: { viewCount: { increment: 1 } },
      });

      const ratings = product.reviews;
      const avgRating =
        ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
          : 0;

      const totalStock = product.productStock.reduce(
        (sum, s) => sum + s.stockCount,
        0,
      );

      return this.enrichProductVariantGroup(this.enrichRelatedProducts({
        ...product,
        attributes: this.sanitizeAttributes(product.attributes),
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: ratings.length,
        totalStock,
      }));
    } catch (error) {
      this.logger.error(
        `Error finding product by slug ${slug}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find product by slug',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    try {
      this.logger.log(`Updating product: ${id}`);

      const existingProduct = await this.findOne(id);
      const shouldUpdateName = dto.name !== undefined;
      const shouldUpdateSlug =
        shouldUpdateName && dto.name !== existingProduct.name;
      const variantGroupId = this.cleanOptionalString(dto.variantGroupId);
      const relatedProductIds = normalizeRelatedProductIds(id, dto.relatedProductIds);

      const updateData: any = {
        ...(dto.brandId && { brand: { connect: { id: dto.brandId } } }),
        ...(dto.variantGroupId !== undefined && {
          variantGroup: variantGroupId
            ? { connect: { id: variantGroupId } }
            : { disconnect: true },
        }),
        ...(dto.variantColor !== undefined && {
          variantColor: this.cleanOptionalString(dto.variantColor),
        }),
        ...(dto.variantMemory !== undefined && {
          variantMemory: this.cleanOptionalString(dto.variantMemory),
        }),
        ...(dto.variantSim !== undefined && {
          variantSim: this.cleanOptionalString(dto.variantSim),
        }),
        ...(shouldUpdateName && { name: dto.name }),
        ...(shouldUpdateSlug && {
          slug: await this.generateUniqueSlug(dto.name, id),
        }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.seoTitle !== undefined && { seoTitle: dto.seoTitle }),
        ...(dto.seoDescription !== undefined && {
          seoDescription: dto.seoDescription,
        }),
        ...(dto.seoH1 !== undefined && { seoH1: dto.seoH1 }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.oldPrice !== undefined && { oldPrice: dto.oldPrice }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isOnSale !== undefined && { isOnSale: dto.isOnSale }),
        ...(dto.isPopular !== undefined && { isPopular: dto.isPopular }),
      };
      const attributes = this.sanitizeAttributes(dto.attributes);

      if (dto.relatedProductIds !== undefined) {
        await this.ensureRelatedProductsExist(relatedProductIds);
        await this.prisma.productRelation.deleteMany({
          where: { sourceProductId: id },
        });
        if (relatedProductIds.length > 0) {
          await this.prisma.productRelation.createMany({
            data: relatedProductIds.map((targetProductId, sortOrder) => ({
              sourceProductId: id,
              targetProductId,
              sortOrder,
            })),
          });
        }
      }

      // Handle categories update (many-to-many)
      if (dto.categoryIds?.length) {
        await this.prisma.productCategory.deleteMany({
          where: { productId: id },
        });
        await this.prisma.productCategory.createMany({
          data: dto.categoryIds.map((catId, idx) => ({
            productId: id,
            categoryId: catId,
            isPrimary: idx === 0,
          })),
        });
      }

      // Handle images update
      if (dto.images !== undefined) {
        await this.prisma.productImage.deleteMany({ where: { productId: id } });
        if (dto.images.length > 0) {
          await this.prisma.productImage.createMany({
            data: dto.images.map((img, idx) => ({
              productId: id,
              url: img.url,
              alt: img.alt,
              sortOrder: img.sortOrder ?? idx,
            })),
          });
        }
      }

      // Handle attributes update
      if (dto.attributes) {
        await this.prisma.productAttribute.deleteMany({
          where: { productId: id },
        });
        if (attributes.length > 0) {
          await this.prisma.productAttribute.createMany({
            data: attributes.map((attr) => ({
              productId: id,
              name: attr.name,
              value: attr.value,
            })),
          });
        }
      }

      const product = await this.prisma.product.update({
        where: { id },
        data: updateData,
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: { isPrimary: 'desc' },
          },
          brand: true,
          images: { orderBy: { sortOrder: 'asc' } },
          attributes: true,
          productStock: {
            include: {
              pickupPoint: { select: { id: true, address: true } },
            },
          },
          relatedProducts: this.getRelatedProductsInclude(),
        },
      });

      await this.invalidateProductCaches();
      await this.cacheService.invalidateProduct(id);

      this.logger.log(`Updated product ${id}`);

      return product;
    } catch (error) {
      this.logger.error(
        `Error updating product ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to update product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async bulkUpdateCategories(dto: BulkUpdateProductCategoriesDto) {
    try {
      const productIds = Array.from(new Set(dto.productIds));
      this.logger.log(
        `Bulk updating categories for ${productIds.length} products`,
      );

      if (productIds.length === 0) {
        throw new HttpException(
          'At least one product must be selected',
          HttpStatus.BAD_REQUEST,
        );
      }

      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        select: { id: true, isDeleted: true },
      });

      if (!category || category.isDeleted) {
        throw new HttpException('Category not found', HttpStatus.NOT_FOUND);
      }

      const existingProductsCount = await this.prisma.product.count({
        where: {
          id: { in: productIds },
          isDeleted: false,
        },
      });

      if (existingProductsCount !== productIds.length) {
        throw new HttpException(
          'Some selected products were not found',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.prisma.$transaction([
        this.prisma.productCategory.deleteMany({
          where: { productId: { in: productIds } },
        }),
        this.prisma.productCategory.createMany({
          data: productIds.map((productId) => ({
            productId,
            categoryId: dto.categoryId,
            isPrimary: true,
          })),
        }),
        this.prisma.product.updateMany({
          where: { id: { in: productIds } },
          data: { updatedAt: new Date() },
        }),
      ]);

      await this.invalidateProductCaches();
      await Promise.all(
        productIds.map((productId) =>
          this.cacheService.invalidateProduct(productId),
        ),
      );

      return {
        updated: productIds.length,
        categoryId: dto.categoryId,
      };
    } catch (error) {
      this.logger.error(
        `Error bulk updating product categories: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to bulk update product categories',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getCatalogCleanupSuggestions(limit = 200) {
    try {
      const suggestionLimit = Math.min(Math.max(Number(limit) || 200, 1), 5000);
      const productPageSize = 500;

      const categories = await this.prisma.category.findMany({
        where: { isDeleted: false, isActive: true },
        select: {
          id: true,
          title: true,
          slug: true,
          parentId: true,
        },
      });
      const categoryById = new Map(
        categories.map((category) => [category.id, category]),
      );

      const products = [];
      let skip = 0;

      while (true) {
        const productPage = await this.prisma.product.findMany({
          where: { isDeleted: false },
          skip,
          take: productPageSize,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            brand: {
              select: {
                name: true,
                slug: true,
              },
            },
            categories: {
              orderBy: { isPrimary: 'desc' },
              select: {
                isPrimary: true,
                category: {
                  select: {
                    id: true,
                    title: true,
                    slug: true,
                    parentId: true,
                  },
                },
              },
            },
            attributes: {
              select: {
                name: true,
                value: true,
              },
            },
          },
        });

        products.push(...productPage);

        if (productPage.length < productPageSize) break;
        skip += productPageSize;
      }

      const suggestions = [];

      for (const product of products) {
        const primaryCategory =
          product.categories.find((item) => item.isPrimary)?.category ||
          product.categories[0]?.category;
        if (!primaryCategory) continue;

        const target = this.pickCatalogCleanupTarget(
          product,
          categories,
          categoryById,
        );
        if (!target || target.category.id === primaryCategory.id) continue;

        const currentPath = this.getCategoryPath(primaryCategory, categoryById);
        const targetPath = this.getCategoryPath(target.category, categoryById);

        suggestions.push({
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          currentCategoryId: primaryCategory.id,
          currentCategoryTitle: primaryCategory.title,
          currentCategoryPath: currentPath.map((category) => category.title),
          targetCategoryId: target.category.id,
          targetCategoryTitle: target.category.title,
          targetCategoryPath: targetPath.map((category) => category.title),
          reason: target.reason,
        });

        if (suggestions.length >= suggestionLimit) break;
      }

      return {
        scanned: products.length,
        suggestions,
      };
    } catch (error) {
      this.logger.error(
        `Error building catalog cleanup suggestions: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to build catalog cleanup suggestions',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async applyCatalogCleanup(dto: ApplyCatalogCleanupDto = {}) {
    try {
      const dryRun = dto.dryRun !== false;
      const excludedProductIds = new Set(
        (dto.excludedProductIds || []).filter(Boolean),
      );
      const cleanup = await this.getCatalogCleanupSuggestions(dto.limit || 500);

      const suggestions = cleanup.suggestions.map((suggestion) => {
        const skipped = excludedProductIds.has(suggestion.productId);
        return {
          ...suggestion,
          skipped,
          skipReason: skipped ? 'excluded' : null,
        };
      });
      const applicableSuggestions = suggestions.filter(
        (suggestion) => !suggestion.skipped,
      );

      const baseResult = {
        dryRun,
        scanned: cleanup.scanned,
        suggested: cleanup.suggestions.length,
        applicable: applicableSuggestions.length,
        excluded: suggestions.length - applicableSuggestions.length,
        suggestions,
      };

      if (dryRun || applicableSuggestions.length === 0) {
        return {
          ...baseResult,
          applied: 0,
          appliedItems: [],
        };
      }

      const productIds = applicableSuggestions.map(
        (suggestion) => suggestion.productId,
      );

      await this.prisma.$transaction([
        this.prisma.productCategory.deleteMany({
          where: { productId: { in: productIds } },
        }),
        this.prisma.productCategory.createMany({
          data: applicableSuggestions.map((suggestion) => ({
            productId: suggestion.productId,
            categoryId: suggestion.targetCategoryId,
            isPrimary: true,
          })),
        }),
        this.prisma.product.updateMany({
          where: { id: { in: productIds } },
          data: { updatedAt: new Date() },
        }),
      ]);

      await this.invalidateProductCaches();
      await Promise.all(
        productIds.map((productId) =>
          this.cacheService.invalidateProduct(productId),
        ),
      );

      return {
        ...baseResult,
        applied: applicableSuggestions.length,
        appliedItems: applicableSuggestions,
      };
    } catch (error) {
      this.logger.error(
        `Error applying catalog cleanup: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to apply catalog cleanup',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async remove(id: string) {
    try {
      this.logger.log(`Soft deleting product: ${id}`);

      await this.findOne(id);
      await this.prisma.product.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
      });
      await this.invalidateProductCaches();
      await this.cacheService.invalidateProduct(id);

      this.logger.log(`Soft deleted product ${id}`);

      return { message: 'Product deleted successfully' };
    } catch (error) {
      this.logger.error(
        `Error removing product ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Не удалось удалить товар',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async restore(id: string) {
    try {
      this.logger.log(`Restoring product: ${id}`);

      const product = await this.prisma.product.findUnique({ where: { id } });

      if (!product) {
        throw new HttpException(
          `Product with ID ${id} not found`,
          HttpStatus.NOT_FOUND,
        );
      }

      if (!product.isDeleted) {
        throw new HttpException(
          'Product is not deleted',
          HttpStatus.BAD_REQUEST,
        );
      }

      const daysSinceDeleted =
        (Date.now() - new Date(product.deletedAt).getTime()) /
        (1000 * 60 * 60 * 24);

      if (daysSinceDeleted > 7) {
        throw new HttpException(
          'Product cannot be restored after 7 days',
          HttpStatus.BAD_REQUEST,
        );
      }

      const restored = await this.prisma.product.update({
        where: { id },
        data: { isDeleted: false, deletedAt: null },
      });

      await this.invalidateProductCaches();
      await this.cacheService.invalidateProduct(id);
      this.logger.log(`Restored product ${id}`);

      return restored;
    } catch (error) {
      this.logger.error(
        `Error restoring product ${id}: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to restore product',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findDeleted(pagination: { page?: number; limit?: number }) {
    try {
      this.logger.log('Finding deleted products');

      const { page = 1, limit = 20 } = pagination;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        this.prisma.product.findMany({
          where: { isDeleted: true },
          skip,
          take: limit,
          orderBy: { deletedAt: 'desc' },
          include: {
            brand: { select: { id: true, name: true, slug: true } },
            categories: {
              include: {
                category: { select: { id: true, title: true, slug: true } },
              },
            },
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        }),
        this.prisma.product.count({ where: { isDeleted: true } }),
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
        `Error finding deleted products: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to find deleted products',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getFilters(categoryId?: string, brandIds?: string[]) {
    try {
      this.logger.log(
        `Getting filters for category: ${categoryId || 'all'}, brands: ${
          brandIds?.join(',') || 'all'
        }`,
      );

      // Keep the facet dataset in sync with the actual product request.
      const where = await this.buildWhereClause({ categoryId, brandIds });

      const [brands, priceRange, attributes] = await Promise.all([
        this.prisma.brand.findMany({
          where: {
            isActive: true,
            products: { some: where },
          },
          select: { id: true, name: true, slug: true },
        }),
        this.prisma.product.aggregate({
          where,
          _min: { price: true },
          _max: { price: true },
        }),
        this.prisma.productAttribute.groupBy({
          by: ['name', 'value'],
          where: { product: where },
          _count: true,
        }),
      ]);

      // Only expose shopper-facing facets. Raw supplier attributes are retained
      // on the product card/page, but would make the catalog filter unusable.
      const groupedAttributes = new Map<string, Map<string, string>>();
      attributes.forEach((attr) => {
        const normalizedName = this.normalizeAttributeName(attr.name);
        if (!normalizedName) return;
        if (this.isConfigurationAttributeName(normalizedName)) return;

        const facetName = this.getCatalogFacetName(normalizedName);
        if (!facetName) return;

        const value = this.normalizeCatalogFacetValue(
          facetName,
          attr.value?.trim() || '',
        );
        if (!value) return;

        if (!groupedAttributes.has(facetName)) {
          groupedAttributes.set(facetName, new Map());
        }
        const values = groupedAttributes.get(facetName)!;
        values.set(this.normalizeText(value), value);
      });

      const catalogAttributes = Object.fromEntries(
        Array.from(groupedAttributes.entries())
          .map(([name, values]) => [
            name,
            this.sortCatalogFacetValues(name, Array.from(values.values())),
          ])
          .filter(([, values]) => values.length > 1),
      );

      return {
        brands,
        priceRange: {
          min: Number(priceRange._min.price) || 0,
          max: Number(priceRange._max.price) || 0,
        },
        attributes: catalogAttributes,
      };
    } catch (error) {
      this.logger.error(`Error getting filters: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get filters',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Recursively get all subcategory IDs for a given category
   */
  private async getAllSubcategoryIds(
    categoryId: string,
    rootSlug?: string,
  ): Promise<string[]> {
    const result: string[] = [categoryId];
    const excludedSlugs = rootSlug
      ? EXCLUDED_DESCENDANT_SLUGS_BY_ROOT_SLUG[rootSlug]
      : undefined;

    const children = await this.prisma.category.findMany({
      where: { parentId: categoryId },
      select: { id: true, slug: true },
    });

    if (children.length > 0) {
      for (const child of children) {
        if (excludedSlugs?.has(child.slug)) {
          continue;
        }

        const childIds = await this.getAllSubcategoryIds(child.id, rootSlug);
        result.push(...childIds);
      }
    }

    return result;
  }

  private async getCategoryIdsForFilter(categoryId: string): Promise<string[]> {
    const rootCategory = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { slug: true },
    });

    return this.getAllSubcategoryIds(categoryId, rootCategory?.slug);
  }

  private async buildWhereClause(filter: ProductFilterDto): Promise<any> {
    const includeInactive = filter.includeInactive === true;

    const where: any = {
      isDeleted: false,
    };

    if (filter.isActive !== undefined) {
      where.isActive = filter.isActive;
    } else if (!includeInactive) {
      where.isActive = true;
    }

    if (filter.categoryId) {
      // Get all subcategory IDs recursively
      const categoryIds = await this.getCategoryIdsForFilter(filter.categoryId);

      // Filter by parent category OR any of its subcategories using many-to-many
      where.categories = {
        some: {
          categoryId:
            categoryIds.length > 1 ? { in: categoryIds } : filter.categoryId,
        },
      };
    }

    if (filter.brandIds?.length) {
      where.brandId = { in: filter.brandIds };
    }

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      where.price = {};
      if (filter.minPrice !== undefined) {
        where.price.gte = filter.minPrice;
      }
      if (filter.maxPrice !== undefined) {
        where.price.lte = filter.maxPrice;
      }
    }

    if (filter.inStock) {
      where.productStock = {
        some: {
          stockCount: { gt: 0 },
        },
      };
    }

    if (filter.onSale) {
      where.isOnSale = true;
    }

    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        {
          productStock: {
            some: { sku: { contains: filter.search, mode: 'insensitive' } },
          },
        },
      ];
    }

    if (filter.attributes) {
      try {
        const attrs = JSON.parse(filter.attributes);
        const attributeGroupConditions: any[] = [];

        Object.entries(attrs).forEach(([name, values]) => {
          const candidateNames = this.mapAttributeQueryNames(name);
          if (candidateNames.length === 0) return;
          const groupConditions: any[] = [];

          if (Array.isArray(values)) {
            const filteredValues = values
              .map((value) => String(value).trim())
              .filter(Boolean);

            if (filteredValues.length === 0) return;

            candidateNames.forEach((candidateName) => {
              filteredValues.forEach((value) => {
                this.mapAttributeQueryValues(value).forEach(
                  (candidateValue) => {
                    groupConditions.push({
                      name: {
                        equals: candidateName,
                        mode: 'insensitive',
                      },
                      value: { contains: candidateValue, mode: 'insensitive' },
                    });
                  },
                );
              });
            });
          } else {
            const singleValue = String(values).trim();
            if (!singleValue) return;

            candidateNames.forEach((candidateName) => {
              this.mapAttributeQueryValues(singleValue).forEach(
                (candidateValue) => {
                  groupConditions.push({
                    name: {
                      equals: candidateName,
                      mode: 'insensitive',
                    },
                    value: { contains: candidateValue, mode: 'insensitive' },
                  });
                },
              );
            });
          }

          if (groupConditions.length > 0) {
            attributeGroupConditions.push({
              attributes: {
                some: {
                  OR: groupConditions,
                },
              },
            });
          }
        });

        if (attributeGroupConditions.length === 0) {
          return where;
        }

        where.AND = [...(where.AND ?? []), ...attributeGroupConditions];
      } catch {
        // Ignore invalid JSON
      }
    }

    return where;
  }

  private buildOrderByClause(sortBy?: ProductSortBy): any {
    switch (sortBy) {
      case ProductSortBy.PRICE_ASC:
        return { price: 'asc' };
      case ProductSortBy.PRICE_DESC:
        return { price: 'desc' };
      case ProductSortBy.NEWEST:
        return { createdAt: 'desc' };
      case ProductSortBy.RATING:
        return { reviews: { _count: 'desc' } };
      case ProductSortBy.POPULARITY:
      default:
        return [
          { isPopular: 'desc' },
          { soldCount: 'desc' },
          { viewCount: 'desc' },
        ];
    }
  }

  private async invalidateProductCaches() {
    await this.cacheService.invalidateAllCaches();
  }
}
