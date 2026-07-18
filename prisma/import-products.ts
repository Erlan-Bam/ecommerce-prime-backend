import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { normalizeParsedCategoryPath } from '../src/shared/lib/catalog-classification';

dotenv.config();

// ─── Config ──────────────────────────────────────────────────────────────────
const EXCEL_FILE = path.join(__dirname, '..', 'public', 'products.xlsx');
const BATCH_SIZE = 50; // Products per DB batch
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_TRUNCATE = process.argv.includes('--skip-truncate');
const WATERMARK_DISABLED = process.argv.includes('--no-watermark');
const WATERMARK_PUBLIC_ID =
  process.env.CLOUDINARY_WATERMARK_PUBLIC_ID ||
  'ecommerce/watermarks/prime-logo';
const WATERMARK_FILE = path.join(
  __dirname,
  '..',
  'public',
  'watermarks',
  'prime.svg',
);
const CLOUDINARY_ENABLED = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET,
);
const FORCE_REWATERMARK = process.env.IMPORT_FORCE_REWATERMARK === 'true';
const DEFAULT_STOCK_PER_POINT = (() => {
  const parsed = Number.parseInt(process.env.IMPORT_DEFAULT_STOCK || '5', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
})();

// ─── Columns that map directly to the Product model ────────────────────────
// These columns are NOT stored in ProductAttribute – they go into Product fields
const PRODUCT_FIELD_COLUMNS = new Set([
  'Изображения',
  'Название',
  'Артикул',
  'Цена',
  'Валюта',
  'Наличие',
  'Категория',
  'Подкатегория',
  'Раздел',
  'URL',
  'Описание',
  'Вариант',
  'Старая цена',
  'Категория источника',
  'Путь источника',
  'ID оффера',
  'Группа оффера',
]);

const TECHNICAL_ATTRIBUTE_COLUMNS = new Set([
  'id оффера',
  'группа оффера',
  'категория источника',
  'путь источника',
  'source id',
  'source slug',
  'offer id',
  'offer group',
]);

const CONFIGURATION_ATTRIBUTE_COLUMNS = new Set([
  'конфигурации',
  'конфигурации товара',
  'конфигурации цены',
  'variant configurations',
  'product configurations',
  'configurations',
]);

// ─── Categories to skip during import ──────────────────────────────────────
const SKIP_CATEGORIES = new Set(['Сервис и услуги']);

// ─── Prisma setup ──────────────────────────────────────────────────────────
const RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY = 2000; // ms
const BATCH_DELAY = 300; // ms delay between batches to avoid overwhelming DB

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3, // low concurrency for remote DB
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
}

function createPrisma(p: Pool) {
  return new PrismaClient({
    adapter: new PrismaPg(p),
  });
}

let pool = createPool();
let prisma = createPrisma(pool);

async function reconnect() {
  console.log('   🔄 Reconnecting to database...');
  try {
    await prisma.$disconnect();
  } catch (_) {}
  try {
    await pool.end();
  } catch (_) {}
  pool = createPool();
  prisma = createPrisma(pool);
  // Verify connection
  await prisma.$executeRawUnsafe('SELECT 1');
  console.log('   ✅ Reconnected successfully');
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = err.message || '';
      const isConnectionError =
        msg.includes('Connection terminated') ||
        msg.includes('connection error') ||
        msg.includes('not queryable') ||
        msg.includes("Can't reach database") ||
        err.code === 'P1001' ||
        err.code === 'P1017' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ECONNREFUSED';

      if (isConnectionError && attempt < RETRY_ATTEMPTS) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        console.log(
          `   ⚠️  Connection error (attempt ${attempt}/${RETRY_ATTEMPTS}), retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
        await reconnect();
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed after ${RETRY_ATTEMPTS} attempts: ${label}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (CLOUDINARY_ENABLED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const parserImageCache = new Map<string, Promise<string>>();
let watermarkAssetPromise: Promise<string | null> | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  // Transliteration map for Cyrillic
  const map: Record<string, string> = {
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
    й: 'j',
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
    х: 'h',
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
    А: 'A',
    Б: 'B',
    В: 'V',
    Г: 'G',
    Д: 'D',
    Е: 'E',
    Ё: 'Yo',
    Ж: 'Zh',
    З: 'Z',
    И: 'I',
    Й: 'J',
    К: 'K',
    Л: 'L',
    М: 'M',
    Н: 'N',
    О: 'O',
    П: 'P',
    Р: 'R',
    С: 'S',
    Т: 'T',
    У: 'U',
    Ф: 'F',
    Х: 'H',
    Ц: 'Ts',
    Ч: 'Ch',
    Ш: 'Sh',
    Щ: 'Shch',
    Ъ: '',
    Ы: 'Y',
    Ь: '',
    Э: 'E',
    Ю: 'Yu',
    Я: 'Ya',
  };

  return text
    .split('')
    .map((char) => map[char] || char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 180);
}

function normalizeAttributeName(rawName: string): string | null {
  const cleanName = rawName.replace(/\s+/g, ' ').trim();
  if (!cleanName) return null;

  const withoutPrefix = cleanName.replace(/^параметр\s*:\s*/i, '').trim();
  const normalizedName = withoutPrefix || cleanName;
  if (!normalizedName) return null;

  const lookupKey = normalizedName
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
  if (TECHNICAL_ATTRIBUTE_COLUMNS.has(lookupKey)) {
    return null;
  }

  return normalizedName;
}

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function isConfigurationAttributeName(name: string): boolean {
  return CONFIGURATION_ATTRIBUTE_COLUMNS.has(normalizeLookupKey(name));
}

function dedupeAttributes(
  attributes: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  const unique = new Map<string, { name: string; value: string }>();

  attributes.forEach((attr) => {
    const normalizedName = normalizeAttributeName(attr.name);
    const normalizedValue = attr.value?.trim();
    if (!normalizedName || !normalizedValue) return;

    const key = `${normalizeLookupKey(normalizedName)}::${normalizeLookupKey(normalizedValue)}`;
    if (!unique.has(key)) {
      unique.set(key, { name: normalizedName, value: normalizedValue });
    }
  });

  return Array.from(unique.values());
}

function mergeConfigurationAttributes(
  incoming: Array<{ name: string; value: string }>,
  existing: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  const hasIncomingConfigurations = incoming.some((attr) =>
    isConfigurationAttributeName(attr.name),
  );
  if (hasIncomingConfigurations) {
    return dedupeAttributes(incoming);
  }

  const existingConfigurations = existing.filter((attr) =>
    isConfigurationAttributeName(attr.name),
  );
  if (existingConfigurations.length === 0) {
    return dedupeAttributes(incoming);
  }

  return dedupeAttributes([...incoming, ...existingConfigurations]);
}

function getCellValue(cell: any): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object') {
    // ExcelJS rich text or hyperlink
    if (cell.text) return String(cell.text).trim();
    if (cell.result) return String(cell.result).trim();
    if (cell.richText) {
      return cell.richText
        .map((r: any) => r.text || '')
        .join('')
        .trim();
    }
    return JSON.stringify(cell);
  }
  return String(cell).trim();
}

function getNormalizedRowCategoryPath(row: Map<string, string>) {
  const topName = row.get('Категория')?.trim() || null;
  const midName = row.get('Подкатегория')?.trim() || null;
  const leafName = row.get('Раздел')?.trim() || null;
  const sourcePath =
    row.get('Путь источника')?.trim() ||
    row.get('Категория источника')?.trim() ||
    null;
  const attributes = Array.from(row.entries())
    .filter(([key]) => !PRODUCT_FIELD_COLUMNS.has(key))
    .map(([name, value]) => ({ name, value }));

  return normalizeParsedCategoryPath({
    productName: row.get('Название')?.trim() || '',
    topCategory: topName,
    subcategory: midName,
    section: leafName,
    sourcePath,
    categoryPath: [topName, midName, leafName].filter(
      (value): value is string => Boolean(value),
    ),
    attributes,
  });
}

function isCloudinaryUrl(value: string): boolean {
  return (
    value.includes('res.cloudinary.com') && value.includes('/image/upload/')
  );
}

function buildWatermarkTransformation(watermarkPublicId: string) {
  return [
    {
      overlay: watermarkPublicId.replace(/\//g, ':'),
      width: 0.2,
      flags: 'relative',
    },
    {
      flags: 'layer_apply',
      gravity: 'south_east',
      x: 18,
      y: 18,
      opacity: 78,
    },
  ];
}

async function ensureWatermarkAsset(): Promise<string | null> {
  if (!CLOUDINARY_ENABLED || WATERMARK_DISABLED) return null;
  if (watermarkAssetPromise) return watermarkAssetPromise;

  watermarkAssetPromise = (async () => {
    try {
      const svg = await fs.readFile(WATERMARK_FILE, 'utf8');
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
      await cloudinary.uploader.upload(dataUri, {
        public_id: WATERMARK_PUBLIC_ID,
        resource_type: 'image',
        overwrite: true,
        invalidate: true,
      });
      console.log(`✅ Watermark asset refreshed: ${WATERMARK_PUBLIC_ID}`);
      return WATERMARK_PUBLIC_ID;
    } catch (error: any) {
      console.warn(
        `⚠️  Watermark asset unavailable, continue without watermark: ${error.message || error}`,
      );
      return null;
    }
  })();

  return watermarkAssetPromise;
}

async function watermarkParserImage(sourceUrl: string): Promise<string> {
  const normalized = sourceUrl.trim();
  if (!normalized) return normalized;
  if (!CLOUDINARY_ENABLED || WATERMARK_DISABLED) return normalized;
  if (isCloudinaryUrl(normalized)) return normalized;

  const cached = parserImageCache.get(normalized);
  if (cached) return cached;

  const uploadPromise = (async () => {
    const watermarkId = await ensureWatermarkAsset();
    if (!watermarkId) return normalized;

    const imageHash = createHash('sha1')
      .update(normalized)
      .digest('hex')
      .slice(0, 20);
    const publicId = `ecommerce/parser/${imageHash}`;

    try {
      const result = await cloudinary.uploader.upload(normalized, {
        public_id: publicId,
        resource_type: 'image',
        overwrite: FORCE_REWATERMARK,
        ...(FORCE_REWATERMARK ? { invalidate: true } : {}),
        timeout: 30_000,
        transformation: buildWatermarkTransformation(watermarkId),
      });
      return result.secure_url;
    } catch (error: any) {
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('already exists')) {
        try {
          const existing = await cloudinary.api.resource(publicId, {
            resource_type: 'image',
          });
          if (existing?.secure_url) return existing.secure_url;
        } catch (_) {
          return cloudinary.url(publicId, { secure: true });
        }
      }

      console.warn(
        `⚠️  Failed to watermark image, using source URL: ${normalized.substring(0, 120)}`,
      );
      return normalized;
    }
  })();

  parserImageCache.set(normalized, uploadPromise);
  return uploadPromise;
}

async function ensureDefaultStockCoverage() {
  const points = await withRetry(
    () =>
      prisma.pickupPoint.findMany({
        where: { isActive: true },
        select: { id: true },
      }),
    'pickup points fetch',
  );

  if (!points.length) {
    console.warn('⚠️  No active pickup points found, stock backfill skipped');
    return;
  }

  const products = await withRetry(
    () =>
      prisma.product.findMany({
        where: { isActive: true },
        select: { id: true, slug: true },
      }),
    'products fetch for stock',
  );

  if (!products.length) return;

  const stockRows = products.flatMap((product) =>
    points.map((point) => ({
      productId: product.id,
      pointId: point.id,
      sku: product.slug,
      stockCount: DEFAULT_STOCK_PER_POINT,
    })),
  );

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < stockRows.length; i += BATCH) {
    const batch = stockRows.slice(i, i + BATCH);
    const result = await withRetry(
      () =>
        prisma.productStock.createMany({
          data: batch,
          skipDuplicates: true,
        }),
      'stock createMany',
    );
    inserted += result.count;
  }

  console.log(
    `✅ Stock coverage ensured: ${products.length} products × ${points.length} points, inserted ${inserted} rows`,
  );
}

async function clearCatalogCaches() {
  const redisUrl =
    process.env.REDIS_URL ||
    (process.env.REDIS_HOST
      ? `redis://:${process.env.REDIS_PASSWORD || ''}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT || '6379'}`
      : null);

  if (!redisUrl) {
    console.warn('⚠️  Redis URL not found, cache invalidation skipped');
    return;
  }

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  try {
    const patterns = [
      'products:*',
      'product:*',
      'category:*',
      'brand:*',
      'dashboard:*',
    ];
    let removed = 0;

    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          '500',
        );
        cursor = next;
        if (keys.length > 0) {
          removed += await redis.del(...keys);
        }
      } while (cursor !== '0');
    }

    console.log(`✅ Redis cache invalidated: ${removed} keys removed`);
  } catch (error: any) {
    console.warn(
      `⚠️  Failed to invalidate Redis cache: ${error.message || error}`,
    );
  } finally {
    await redis.quit();
  }
}

// ─── Main import logic ─────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📦 Product Import from Excel');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  File: ${EXCEL_FILE}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Skip truncate: ${SKIP_TRUNCATE}`);
  console.log(
    `  Watermark mode: ${!WATERMARK_DISABLED ? 'ON' : 'OFF (--no-watermark)'}`,
  );
  console.log('');

  // ── Step 1: Read Excel via streaming ────────────────────────────────────
  console.log('📖 Reading Excel file (streaming)...');

  // Dynamic import for exceljs (CommonJS compatible)
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(EXCEL_FILE, {});

  // Parse all rows
  const headers: { col: number; name: string }[] = [];
  const rows: Map<string, string>[] = [];

  await new Promise<void>((resolve, reject) => {
    workbook.on('worksheet', (ws: any) => {
      ws.on('row', (row: any) => {
        const rowNum = row.number;

        if (rowNum === 1) {
          // Header row
          row.eachCell((cell: any, colNum: number) => {
            const val = getCellValue(cell.value);
            if (val) headers.push({ col: colNum, name: val });
          });
        } else {
          // Data row
          const rowData = new Map<string, string>();
          row.eachCell((cell: any, colNum: number) => {
            const header = headers.find((h) => h.col === colNum);
            if (!header) return;
            const val = getCellValue(cell.value);
            if (val) rowData.set(header.name, val);
          });
          if (rowData.size > 0) rows.push(rowData);
        }

        if (rowNum % 3000 === 0) {
          console.log(`   ...read ${rowNum} rows`);
        }
      });
    });
    workbook.on('end', resolve);
    workbook.on('error', reject);
    workbook.read();
  });

  console.log(
    `✅ Read ${rows.length} product rows with ${headers.length} columns`,
  );
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — showing first 3 products:');
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const row = rows[i];
      console.log(`\n--- Product ${i + 1} ---`);
      console.log(`  Name: ${row.get('Название')}`);
      console.log(`  SKU: ${row.get('Артикул')}`);
      console.log(`  Price: ${row.get('Цена')}`);
      console.log(`  OldPrice: ${row.get('Старая цена')}`);
      console.log(
        `  Category: ${row.get('Категория')} > ${row.get('Подкатегория')} > ${row.get('Раздел')}`,
      );
      console.log(`  Image: ${row.get('Изображения')?.substring(0, 80)}...`);
      const attrCount = [...row.keys()].filter(
        (k) => !PRODUCT_FIELD_COLUMNS.has(k),
      ).length;
      console.log(`  Attributes: ${attrCount} fields`);
    }
    console.log('\n🛑 Dry run complete. Run without --dry-run to import.');
    return;
  }

  if (!WATERMARK_DISABLED && CLOUDINARY_ENABLED) {
    await ensureWatermarkAsset();
  } else if (!WATERMARK_DISABLED && !CLOUDINARY_ENABLED) {
    console.warn(
      '⚠️  CLOUDINARY env is missing, parser images will be saved without watermark',
    );
  }

  // ── Step 2: Clean existing product data ─────────────────────────────────
  if (!SKIP_TRUNCATE) {
    console.log('🧹 Cleaning existing product data...');
    await withRetry(
      () =>
        prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductAttribute" CASCADE'),
      'truncate ProductAttribute',
    );
    await withRetry(
      () => prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductImage" CASCADE'),
      'truncate ProductImage',
    );
    await withRetry(
      () => prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductStock" CASCADE'),
      'truncate ProductStock',
    );
    await withRetry(
      () =>
        prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductCategory" CASCADE'),
      'truncate ProductCategory',
    );
    await withRetry(
      () => prisma.$executeRawUnsafe('TRUNCATE TABLE "Favorite" CASCADE'),
      'truncate Favorite',
    );
    await withRetry(
      () => prisma.$executeRawUnsafe('TRUNCATE TABLE "Product" CASCADE'),
      'truncate Product',
    );
    console.log('✅ Cleaned');
  }

  // ── Step 3: Collect & upsert Brands ─────────────────────────────────────
  console.log('🏷️  Processing brands...');
  const brandNames = new Set<string>();
  for (const row of rows) {
    const cat = row.get('Категория');
    if (cat) brandNames.add(cat.trim());
  }

  const brandMap = new Map<string, string>(); // name → id
  for (const name of brandNames) {
    const slug = slugify(name);
    const brand = await withRetry(
      () =>
        prisma.brand.upsert({
          where: { slug },
          update: { name },
          create: { name, slug },
        }),
      `brand upsert: ${name}`,
    );
    brandMap.set(name, brand.id);
  }
  console.log(`✅ ${brandMap.size} brands ready`);

  // ── Step 4: Collect & upsert Categories ─────────────────────────────────
  console.log('📁 Processing categories...');

  // Category hierarchy: Категория (top) > Подкатегория (mid) > Раздел (leaf)
  // We build a unique key for each level to avoid duplicates
  const categoryMap = new Map<string, string>(); // "key" → id

  for (const row of rows) {
    const normalizedPath = getNormalizedRowCategoryPath(row);
    const topName = normalizedPath.topCategory || undefined;
    const midName = normalizedPath.subcategory || undefined;
    const leafName = normalizedPath.section || undefined;

    // Top-level category (same as brand usually, e.g. "Apple")
    if (topName && !categoryMap.has(topName)) {
      const slug = slugify(topName);
      const cat = await withRetry(
        () =>
          prisma.category.upsert({
            where: { slug },
            update: { title: topName },
            create: { title: topName, slug, sortOrder: categoryMap.size },
          }),
        `category upsert: ${topName}`,
      );
      categoryMap.set(topName, cat.id);
    }

    // Mid-level (subcategory, e.g. "Смартфоны Apple iPhone")
    if (midName) {
      const midKey = `${topName}>${midName}`;
      if (!categoryMap.has(midKey)) {
        const slug = slugify(midName);
        // Ensure unique slug
        let finalSlug = slug;
        let attempt = 0;
        while (true) {
          const existing = await withRetry(
            () => prisma.category.findUnique({ where: { slug: finalSlug } }),
            `category find: ${finalSlug}`,
          );
          if (
            !existing ||
            existing.parentId === (topName ? categoryMap.get(topName) : null)
          ) {
            break;
          }
          attempt++;
          finalSlug = `${slug}-${attempt}`;
        }

        const parentId = topName ? categoryMap.get(topName) : undefined;
        const cat = await withRetry(
          () =>
            prisma.category.upsert({
              where: { slug: finalSlug },
              update: { title: midName, parentId: parentId || null },
              create: {
                title: midName,
                slug: finalSlug,
                parentId: parentId || null,
                sortOrder: categoryMap.size,
              },
            }),
          `category upsert: ${midName}`,
        );
        categoryMap.set(midKey, cat.id);
      }
    }

    // Leaf-level (section, e.g. "IPhone Air")
    if (leafName) {
      const leafKey = `${topName}>${midName}>${leafName}`;
      if (!categoryMap.has(leafKey)) {
        const slug = slugify(leafName);
        let finalSlug = slug;
        let attempt = 0;
        const parentKey = midName ? `${topName}>${midName}` : topName;
        const parentId = parentKey ? categoryMap.get(parentKey) : undefined;

        while (true) {
          const existing = await withRetry(
            () => prisma.category.findUnique({ where: { slug: finalSlug } }),
            `category find: ${finalSlug}`,
          );
          if (!existing || existing.parentId === (parentId || null)) {
            break;
          }
          attempt++;
          finalSlug = `${slug}-${attempt}`;
        }

        const cat = await withRetry(
          () =>
            prisma.category.upsert({
              where: { slug: finalSlug },
              update: { title: leafName, parentId: parentId || null },
              create: {
                title: leafName,
                slug: finalSlug,
                parentId: parentId || null,
                sortOrder: categoryMap.size,
              },
            }),
          `category upsert: ${leafName}`,
        );
        categoryMap.set(leafKey, cat.id);
      }
    }
  }
  console.log(`✅ ${categoryMap.size} categories ready`);

  // ── Step 5: Import products in batches ──────────────────────────────────
  console.log(
    `📦 Importing ${rows.length} products in batches of ${BATCH_SIZE}...`,
  );

  const slugCounter = new Map<string, number>(); // track slug uniqueness
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let totalSourceImages = 0;
  let totalWatermarkedImages = 0;
  let totalImageFallbacks = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      try {
        const name = row.get('Название')?.trim();
        if (!name) {
          skipped++;
          continue;
        }

        // Skip products from excluded categories
        const topCat = row.get('Категория')?.trim();
        if (topCat && SKIP_CATEGORIES.has(topCat)) {
          skipped++;
          continue;
        }

        const sku = row.get('Артикул')?.trim() || '';
        const priceStr = row.get('Цена')?.trim() || '0';
        const price =
          parseFloat(priceStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        const oldPriceStr = row.get('Старая цена')?.trim() || '';
        const oldPrice = oldPriceStr
          ? parseFloat(oldPriceStr.replace(/[^\d.,]/g, '').replace(',', '.')) ||
            null
          : null;
        const description = row.get('Описание')?.trim() || null;
        const availability = row.get('Наличие')?.trim() || '';
        const isActive = availability.toLowerCase() !== 'нет';
        const isOnSale = oldPrice !== null && oldPrice > price;
        const rawImageValue = row.get('Изображения')?.trim() || '';
        const sourceImageUrls = Array.from(
          new Set(
            rawImageValue
              .split(';')
              .map((url) => url.trim())
              .filter((url) => Boolean(url)),
          ),
        );

        const preparedImageUrls =
          sourceImageUrls.length > 0
            ? await Promise.all(
                sourceImageUrls.map((sourceUrl) =>
                  watermarkParserImage(sourceUrl),
                ),
              )
            : [];
        totalSourceImages += sourceImageUrls.length;
        if (!WATERMARK_DISABLED && CLOUDINARY_ENABLED) {
          sourceImageUrls.forEach((sourceUrl, idx) => {
            const targetUrl = preparedImageUrls[idx];
            if (
              targetUrl &&
              targetUrl !== sourceUrl &&
              isCloudinaryUrl(targetUrl)
            ) {
              totalWatermarkedImages++;
            } else if (targetUrl) {
              totalImageFallbacks++;
            }
          });
        }

        // Build slug from SKU or name
        let baseSlug = sku ? `product-${sku}` : slugify(name);
        if (!baseSlug) baseSlug = `product-${i}`;
        const count = slugCounter.get(baseSlug) || 0;
        slugCounter.set(baseSlug, count + 1);
        const slug = count > 0 ? `${baseSlug}-${count}` : baseSlug;

        // Brand
        const brandName = row.get('Категория')?.trim();
        const brandId = brandName ? brandMap.get(brandName) || null : null;

        // Category IDs to link
        const categoryIds: string[] = [];
        const normalizedPath = getNormalizedRowCategoryPath(row);
        const topName = normalizedPath.topCategory || undefined;
        const midName = normalizedPath.subcategory || undefined;
        const leafName = normalizedPath.section || undefined;

        if (topName && categoryMap.has(topName)) {
          categoryIds.push(categoryMap.get(topName)!);
        }
        if (midName) {
          const midKey = `${topName}>${midName}`;
          if (categoryMap.has(midKey))
            categoryIds.push(categoryMap.get(midKey)!);
        }
        if (leafName) {
          const leafKey = `${topName}>${midName}>${leafName}`;
          if (categoryMap.has(leafKey))
            categoryIds.push(categoryMap.get(leafKey)!);
        }

        // Collect attributes — everything NOT in the direct-mapping set
        const attributes: { name: string; value: string }[] = [];
        const uniqueAttributes = new Set<string>();
        for (const [key, value] of row.entries()) {
          if (PRODUCT_FIELD_COLUMNS.has(key)) continue;
          if (!value || value.trim() === '') continue;

          const normalizedName = normalizeAttributeName(key);
          if (!normalizedName) continue;

          const normalizedValue = value.trim();
          const dedupeKey = `${normalizedName.toLowerCase()}::${normalizedValue.toLowerCase()}`;
          if (uniqueAttributes.has(dedupeKey)) continue;

          uniqueAttributes.add(dedupeKey);
          attributes.push({ name: normalizedName, value: normalizedValue });
        }

        // Upsert product (idempotent – safe to re-run)
        const productData = {
          name,
          description,
          price,
          oldPrice,
          isActive,
          isOnSale,
          brandId,
        };

        const categoriesCreate = categoryIds.map((catId, idx) => ({
          categoryId: catId,
          isPrimary: idx === 0,
        }));

        const imagesCreate = preparedImageUrls.map((url, idx) => ({
          url: url.trim(),
          alt: `${name} - image ${idx + 1}`,
          sortOrder: idx,
        }));

        const attributesCreate =
          attributes.length > 0
            ? attributes.map((attr) => ({
                name: attr.name,
                value: attr.value,
              }))
            : [];

        const existingProductAttributes = await withRetry(
          () =>
            prisma.product.findUnique({
              where: { slug },
              select: {
                attributes: {
                  select: { name: true, value: true },
                },
              },
            }),
          `lookup existing product attributes: ${slug}`,
        );
        const mergedAttributesForUpdate = mergeConfigurationAttributes(
          attributesCreate,
          existingProductAttributes?.attributes || [],
        );

        await withRetry(
          () =>
            prisma.product.upsert({
              where: { slug },
              create: {
                ...productData,
                slug,
                categories: { create: categoriesCreate },
                images:
                  imagesCreate.length > 0
                    ? { create: imagesCreate }
                    : undefined,
                attributes:
                  attributesCreate.length > 0
                    ? { create: attributesCreate }
                    : undefined,
              },
              update: {
                ...productData,
                // Delete old relations, then recreate
                categories: {
                  deleteMany: {},
                  create: categoriesCreate,
                },
                images: {
                  deleteMany: {},
                  ...(imagesCreate.length > 0 ? { create: imagesCreate } : {}),
                },
                attributes: {
                  deleteMany: {},
                  ...(mergedAttributesForUpdate.length > 0
                    ? { create: mergedAttributesForUpdate }
                    : {}),
                },
              },
            }),
          `product upsert: ${name.substring(0, 40)}`,
        );

        imported++;
      } catch (err: any) {
        errors++;
        if (errors <= 10) {
          const name = row.get('Название') || 'unknown';
          console.error(
            `   ❌ Error on "${name.substring(0, 60)}": ${err.message?.substring(0, 120)}`,
          );
        }
      }
    }

    const progress = Math.min(i + BATCH_SIZE, rows.length);
    if (progress % 100 === 0 || progress >= rows.length) {
      console.log(
        `   📊 Progress: ${progress}/${rows.length} (imported: ${imported}, skipped: ${skipped}, errors: ${errors})`,
      );
    }

    // Small delay between batches to avoid overwhelming the remote DB
    if (i + BATCH_SIZE < rows.length) {
      await sleep(BATCH_DELAY);
    }
  }

  await ensureDefaultStockCoverage();
  await clearCatalogCaches();

  // ── Step 6: Summary ─────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📊 Import Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total rows in Excel:    ${rows.length}`);
  console.log(`  Successfully imported:  ${imported}`);
  console.log(`  Skipped (no name):      ${skipped}`);
  console.log(`  Errors:                 ${errors}`);
  console.log(`  Brands created:         ${brandMap.size}`);
  console.log(`  Categories created:     ${categoryMap.size}`);
  console.log(`  Source images found:    ${totalSourceImages}`);
  if (!WATERMARK_DISABLED) {
    console.log(`  Watermarked images:     ${totalWatermarkedImages}`);
    console.log(`  Fallback image URLs:    ${totalImageFallbacks}`);
  }
  console.log('');
  console.log('  Database counts:');
  try {
    console.log(
      `    Products:       ${await withRetry(() => prisma.product.count(), 'count products')}`,
    );
    console.log(
      `    Brands:         ${await withRetry(() => prisma.brand.count(), 'count brands')}`,
    );
    console.log(
      `    Categories:     ${await withRetry(() => prisma.category.count(), 'count categories')}`,
    );
    console.log(
      `    Images:         ${await withRetry(() => prisma.productImage.count(), 'count images')}`,
    );
    console.log(
      `    Attributes:     ${await withRetry(() => prisma.productAttribute.count(), 'count attributes')}`,
    );
  } catch (err: any) {
    console.log(
      `    ⚠️  Could not fetch counts: ${err.message?.substring(0, 80)}`,
    );
  }
  console.log('═══════════════════════════════════════════════════════════');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
    console.log('\n✅ Import completed successfully!');
  })
  .catch(async (e) => {
    console.error('\n❌ Import failed:', e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
