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

// ─── Prisma setup ──────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

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
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductAttribute" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductImage" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductStock" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductCategory" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Favorite" CASCADE');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Product" CASCADE');
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
    const brand = await prisma.brand.upsert({
      where: { slug },
      update: { name },
      create: { name, slug },
    });
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
      const cat = await prisma.category.upsert({
        where: { slug },
        update: { title: topName },
        create: { title: topName, slug, sortOrder: categoryMap.size },
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
          const existing = await prisma.category.findUnique({
            where: { slug: finalSlug },
          });
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
        const cat = await prisma.category.upsert({
          where: { slug: finalSlug },
          update: { title: midName, parentId: parentId || null },
          create: {
            title: midName,
            slug: finalSlug,
            parentId: parentId || null,
            sortOrder: categoryMap.size,
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
          const existing = await prisma.category.findUnique({
            where: { slug: finalSlug },
          });
          if (!existing || existing.parentId === (parentId || null)) {
            break;
          }
          attempt++;
          finalSlug = `${slug}-${attempt}`;
        }

        const cat = await prisma.category.upsert({
          where: { slug: finalSlug },
          update: { title: leafName, parentId: parentId || null },
          create: {
            title: leafName,
            slug: finalSlug,
            parentId: parentId || null,
            sortOrder: categoryMap.size,
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
                  create: imageUrl.split(',').map((url, idx) => ({
                    url: url.trim(),
                    alt: `${name} - image ${idx + 1}`,
                    sortOrder: idx,
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
  console.log(`    Products:       ${await prisma.product.count()}`);
  console.log(`    Brands:         ${await prisma.brand.count()}`);
  console.log(`    Categories:     ${await prisma.category.count()}`);
  console.log(`    Images:         ${await prisma.productImage.count()}`);
  console.log(`    Attributes:     ${await prisma.productAttribute.count()}`);
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
