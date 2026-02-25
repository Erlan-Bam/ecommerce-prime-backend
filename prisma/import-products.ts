import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

// ─── Config ──────────────────────────────────────────────────────────────────
const EXCEL_FILE = path.join(__dirname, '..', 'public', 'products.xlsx');
const BATCH_SIZE = 50; // Products per DB batch
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_TRUNCATE = process.argv.includes('--skip-truncate');

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
]);

// ─── Base URL for static images ────────────────────────────────────────────
const BASE_URL = 'https://api.prime-electronics.ru';

// Category images — local images use BASE_URL prefix, subcategories use internet images
const CATEGORY_IMAGES: Record<string, string> = {
  // Parent categories (local images)
  apple: `${BASE_URL}/images/categories/apple.png`,
  samsung: `${BASE_URL}/images/categories/samsung.png`,
  xiaomi: `${BASE_URL}/images/categories/xiaomi.png`,
  dyson: `${BASE_URL}/images/categories/dyson.png`,
  smartphones: `${BASE_URL}/images/categories/smartphones.png`,
  laptops: `${BASE_URL}/images/categories/laptops.png`,
  'smart-watches': `${BASE_URL}/images/categories/smart-watches.png`,
  headphones: `${BASE_URL}/images/categories/headphones.png`,
  'gaming-consoles': `${BASE_URL}/images/categories/playstations.png`,
  accessories: `${BASE_URL}/images/categories/accessories.png`,
  macbook: `${BASE_URL}/images/categories/macbook.png`,

  // Apple subcategories
  iphone:
    'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-pro-finish-select-202409-6-3inch-naturaltitanium?wid=400&hei=400&fmt=p-jpg',
  'apple-watch':
    'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/store-card-40-watch-s10-202409?wid=400&hei=400&fmt=p-jpg',
  airpods:
    'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83?wid=400&hei=400&fmt=p-jpg',
  imac:
    'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/store-card-40-imac-202310?wid=400&hei=400&fmt=p-jpg',
  ipad:
    'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-select-wifi-blue-202203?wid=400&hei=400&fmt=p-jpg',
  'mac-mini':
    'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mac-mini-hero-202301?wid=400&hei=400&fmt=p-jpg',

  // Samsung subcategories
  'samsung-galaxy':
    'https://fdn2.gsmarena.com/vv/pics/samsung/samsung-galaxy-s24-ultra-5g-sm-s928-0.jpg',
  'samsung-watch':
    'https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-watch6.jpg',
  'galaxy-buds': `${BASE_URL}/images/categories/headphones.png`,
  'samsung-tablets':
    'https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-tab-s9-5g.jpg',

  // Xiaomi subcategories
  'xiaomi-phones':
    'https://fdn2.gsmarena.com/vv/bigpic/xiaomi-14.jpg',
  'xiaomi-watch':
    'https://fdn2.gsmarena.com/vv/bigpic/xiaomi-watch-2-pro.jpg',
  'xiaomi-buds': `${BASE_URL}/images/categories/headphones.png`,

  // Dyson subcategories
  'dyson-vacuums':
    'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/394472-01.png',
  'dyson-aircare':
    'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/369535-01.png',
  'dyson-haircare':
    'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/426081-01.png',
};

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

// ─── Main import logic ─────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📦 Product Import from Excel');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  File: ${EXCEL_FILE}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Skip truncate: ${SKIP_TRUNCATE}`);
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
    const topName = row.get('Категория')?.trim();
    const midName = row.get('Подкатегория')?.trim();
    const leafName = row.get('Раздел')?.trim();

    // Top-level category (same as brand usually, e.g. "Apple")
    if (topName && !categoryMap.has(topName)) {
      const slug = slugify(topName);
      const image = CATEGORY_IMAGES[slug] || null;
      const cat = await prisma.category.upsert({
        where: { slug },
        update: { title: topName, ...(image && { image }) },
        create: { title: topName, slug, sortOrder: categoryMap.size, ...(image && { image }) },
      });
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
        const midImage = CATEGORY_IMAGES[finalSlug] || null;
        const cat = await prisma.category.upsert({
          where: { slug: finalSlug },
          update: { title: midName, parentId: parentId || null, ...(midImage && { image: midImage }) },
          create: {
            title: midName,
            slug: finalSlug,
            parentId: parentId || null,
            sortOrder: categoryMap.size,
            ...(midImage && { image: midImage }),
          },
        });
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

        const leafImage = CATEGORY_IMAGES[finalSlug] || null;
        const cat = await prisma.category.upsert({
          where: { slug: finalSlug },
          update: { title: leafName, parentId: parentId || null, ...(leafImage && { image: leafImage }) },
          create: {
            title: leafName,
            slug: finalSlug,
            parentId: parentId || null,
            sortOrder: categoryMap.size,
            ...(leafImage && { image: leafImage }),
          },
        });
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
        const imageUrl = row.get('Изображения')?.trim() || null;

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
        const topName = row.get('Категория')?.trim();
        const midName = row.get('Подкатегория')?.trim();
        const leafName = row.get('Раздел')?.trim();

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
        for (const [key, value] of row.entries()) {
          if (PRODUCT_FIELD_COLUMNS.has(key)) continue;
          if (!value || value.trim() === '') continue;
          attributes.push({ name: key, value: value.trim() });
        }

        // Create product with all relations
        await prisma.product.create({
          data: {
            name,
            slug,
            description,
            price,
            oldPrice,
            isActive,
            isOnSale,
            brandId,
            // Relations
            categories: {
              create: categoryIds.map((catId, idx) => ({
                categoryId: catId,
                isPrimary: idx === 0,
              })),
            },
            images: imageUrl
              ? {
                  create: imageUrl.split(';').map((url, idx) => ({
                    url: url.trim(),
                    alt: `${name} - image ${idx + 1}`,
                    sortOrder: idx,
                  })).filter((img) => img.url.length > 0),
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
        });

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
    if (progress % 500 === 0 || progress >= rows.length) {
      console.log(
        `   📊 Progress: ${progress}/${rows.length} (imported: ${imported}, skipped: ${skipped}, errors: ${errors})`,
      );
    }

    // Small delay between batches to avoid overwhelming the remote DB
    if (i + BATCH_SIZE < rows.length) {
      await sleep(BATCH_DELAY);
    }
  }

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
