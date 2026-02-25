import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

// ─── Config ──────────────────────────────────────────────────────────────────
const EXCEL_FILE = path.join(__dirname, '..', 'public', 'products.xlsx');
const BATCH_SIZE = 50;
const SKIP_ROWS = 7000; // Skip first 9500 rows (already imported)

// ─── Columns that map directly to the Product model ────────────────────────
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
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
    з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'Zh',
    З: 'Z', И: 'I', Й: 'J', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O',
    П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H', Ц: 'Ts',
    Ч: 'Ch', Ш: 'Sh', Щ: 'Shch', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
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
    if (cell.text) return String(cell.text).trim();
    if (cell.result) return String(cell.result).trim();
    if (cell.richText) {
      return cell.richText.map((r: any) => r.text || '').join('').trim();
    }
    return JSON.stringify(cell);
  }
  return String(cell).trim();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📦 Import REMAINING products (rows after ' + SKIP_ROWS + ')');
  console.log('═══════════════════════════════════════════════════════════');

  // ── Step 1: Read Excel ──────────────────────────────────────────────────
  console.log('📖 Reading Excel file...');
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(EXCEL_FILE, {});

  const headers: { col: number; name: string }[] = [];
  const allRows: Map<string, string>[] = [];

  await new Promise<void>((resolve, reject) => {
    workbook.on('worksheet', (ws: any) => {
      ws.on('row', (row: any) => {
        const rowNum = row.number;
        if (rowNum === 1) {
          row.eachCell((cell: any, colNum: number) => {
            const val = getCellValue(cell.value);
            if (val) headers.push({ col: colNum, name: val });
          });
        } else {
          const rowData = new Map<string, string>();
          row.eachCell((cell: any, colNum: number) => {
            const header = headers.find((h) => h.col === colNum);
            if (!header) return;
            const val = getCellValue(cell.value);
            if (val) rowData.set(header.name, val);
          });
          if (rowData.size > 0) allRows.push(rowData);
        }
      });
    });
    workbook.on('end', resolve);
    workbook.on('error', reject);
    workbook.read();
  });

  console.log(`✅ Read ${allRows.length} total rows`);

  // Only take rows after SKIP_ROWS
  const rows = allRows.slice(SKIP_ROWS);
  console.log(`⏭️  Skipping first ${SKIP_ROWS} rows, importing ${rows.length} remaining\n`);

  // ── Step 2: Build brand map from DB ─────────────────────────────────────
  console.log('🏷️  Loading brands...');
  const brandMap = new Map<string, string>();
  const existingBrands = await prisma.brand.findMany();
  for (const b of existingBrands) {
    brandMap.set(b.name, b.id);
  }

  // Upsert any new brands from remaining rows
  for (const row of rows) {
    const cat = row.get('Категория')?.trim();
    if (cat && !brandMap.has(cat)) {
      const slug = slugify(cat);
      const brand = await prisma.brand.upsert({
        where: { slug },
        update: { name: cat },
        create: { name: cat, slug },
      });
      brandMap.set(cat, brand.id);
    }
  }
  console.log(`✅ ${brandMap.size} brands ready`);

  // ── Step 3: Build category map from DB ──────────────────────────────────
  console.log('📁 Loading/creating categories...');
  const categoryMap = new Map<string, string>();

  // Load all existing categories
  const existingCats = await prisma.category.findMany();
  // Build reverse map: we need slug → id AND title-key → id
  const slugToId = new Map<string, string>();
  for (const c of existingCats) {
    slugToId.set(c.slug, c.id);
  }

  for (const row of rows) {
    const topName = row.get('Категория')?.trim();
    const midName = row.get('Подкатегория')?.trim();
    const leafName = row.get('Раздел')?.trim();

    if (topName && !categoryMap.has(topName)) {
      const slug = slugify(topName);
      if (slugToId.has(slug)) {
        categoryMap.set(topName, slugToId.get(slug)!);
      } else {
        const cat = await prisma.category.upsert({
          where: { slug },
          update: { title: topName },
          create: { title: topName, slug, sortOrder: existingCats.length + categoryMap.size },
        });
        categoryMap.set(topName, cat.id);
        slugToId.set(slug, cat.id);
      }
    }

    if (midName) {
      const midKey = `${topName}>${midName}`;
      if (!categoryMap.has(midKey)) {
        const slug = slugify(midName);
        let finalSlug = slug;
        let attempt = 0;
        while (true) {
          const existing = slugToId.has(finalSlug)
            ? await prisma.category.findUnique({ where: { slug: finalSlug } })
            : null;
          if (!existing || existing.parentId === (topName ? categoryMap.get(topName) : null)) {
            break;
          }
          attempt++;
          finalSlug = `${slug}-${attempt}`;
        }

        if (slugToId.has(finalSlug)) {
          categoryMap.set(midKey, slugToId.get(finalSlug)!);
        } else {
          const parentId = topName ? categoryMap.get(topName) : undefined;
          const cat = await prisma.category.upsert({
            where: { slug: finalSlug },
            update: { title: midName, parentId: parentId || null },
            create: {
              title: midName,
              slug: finalSlug,
              parentId: parentId || null,
              sortOrder: existingCats.length + categoryMap.size,
            },
          });
          categoryMap.set(midKey, cat.id);
          slugToId.set(finalSlug, cat.id);
        }
      }
    }

    if (leafName) {
      const leafKey = `${topName}>${midName}>${leafName}`;
      if (!categoryMap.has(leafKey)) {
        const slug = slugify(leafName);
        let finalSlug = slug;
        let attempt = 0;
        const parentKey = midName ? `${topName}>${midName}` : topName;
        const parentId = parentKey ? categoryMap.get(parentKey) : undefined;

        while (true) {
          const existing = slugToId.has(finalSlug)
            ? await prisma.category.findUnique({ where: { slug: finalSlug } })
            : null;
          if (!existing || existing.parentId === (parentId || null)) {
            break;
          }
          attempt++;
          finalSlug = `${slug}-${attempt}`;
        }

        if (slugToId.has(finalSlug)) {
          categoryMap.set(leafKey, slugToId.get(finalSlug)!);
        } else {
          const cat = await prisma.category.upsert({
            where: { slug: finalSlug },
            update: { title: leafName, parentId: parentId || null },
            create: {
              title: leafName,
              slug: finalSlug,
              parentId: parentId || null,
              sortOrder: existingCats.length + categoryMap.size,
            },
          });
          categoryMap.set(leafKey, cat.id);
          slugToId.set(finalSlug, cat.id);
        }
      }
    }
  }
  console.log(`✅ ${categoryMap.size} categories ready`);

  // ── Step 4: Import remaining products with upsert ───────────────────────
  console.log(`📦 Importing ${rows.length} products with upsert...\n`);

  // Build slugCounter from the SKIPPED rows first, so slug numbering matches original import
  console.log(`🔢 Building slug counter from first ${SKIP_ROWS} rows...`);
  const slugCounter = new Map<string, number>();
  const skippedRows = allRows.slice(0, SKIP_ROWS);
  for (let i = 0; i < skippedRows.length; i++) {
    const row = skippedRows[i];
    const name = row.get('Название')?.trim();
    if (!name) continue;
    const sku = row.get('Артикул')?.trim() || '';
    let baseSlug = sku ? `product-${sku}` : slugify(name);
    if (!baseSlug) baseSlug = `product-${i}`;
    const count = slugCounter.get(baseSlug) || 0;
    slugCounter.set(baseSlug, count + 1);
  }
  console.log(`✅ Slug counter built with ${slugCounter.size} unique slugs\n`);

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
          ? parseFloat(oldPriceStr.replace(/[^\d.,]/g, '').replace(',', '.')) || null
          : null;
        const description = row.get('Описание')?.trim() || null;
        const availability = row.get('Наличие')?.trim() || '';
        const isActive = availability.toLowerCase() !== 'нет';
        const isOnSale = oldPrice !== null && oldPrice > price;
        const imageUrl = row.get('Изображения')?.trim() || null;

        // Build slug — use slugCounter to match original import behavior
        let baseSlug = sku ? `product-${sku}` : slugify(name);
        if (!baseSlug) baseSlug = `product-${SKIP_ROWS + i}`;
        const count = slugCounter.get(baseSlug) || 0;
        slugCounter.set(baseSlug, count + 1);
        const slug = count > 0 ? `${baseSlug}-${count}` : baseSlug;

        // Skip if already exists in DB
        const existingProduct = await prisma.product.findUnique({ where: { slug } });
        if (existingProduct) {
          skipped++;
          continue;
        }

        // Brand
        const brandName = row.get('Категория')?.trim();
        const brandId = brandName ? brandMap.get(brandName) || null : null;

        // Category IDs
        const categoryIds: string[] = [];
        const topName = row.get('Категория')?.trim();
        const midName = row.get('Подкатегория')?.trim();
        const leafName = row.get('Раздел')?.trim();

        if (topName && categoryMap.has(topName)) {
          categoryIds.push(categoryMap.get(topName)!);
        }
        if (midName) {
          const midKey = `${topName}>${midName}`;
          if (categoryMap.has(midKey)) categoryIds.push(categoryMap.get(midKey)!);
        }
        if (leafName) {
          const leafKey = `${topName}>${midName}>${leafName}`;
          if (categoryMap.has(leafKey)) categoryIds.push(categoryMap.get(leafKey)!);
        }

        // Attributes
        const attributes: { name: string; value: string }[] = [];
        for (const [key, value] of row.entries()) {
          if (PRODUCT_FIELD_COLUMNS.has(key)) continue;
          if (!value || value.trim() === '') continue;
          attributes.push({ name: key, value: value.trim() });
        }

        // Create product
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
        if (errors <= 20) {
          const name = row.get('Название') || 'unknown';
          console.error(
            `   ❌ Error on "${name.substring(0, 60)}": ${err.message?.substring(0, 120)}`,
          );
        }
      }
    }

    const progress = Math.min(i + BATCH_SIZE, rows.length);
    if (progress % 200 === 0 || progress >= rows.length) {
      console.log(
        `   📊 Progress: ${progress}/${rows.length} (imported: ${imported}, skipped: ${skipped}, errors: ${errors})`,
      );
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📊 Resume Import Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Rows processed:         ${rows.length}`);
  console.log(`  Successfully imported:  ${imported}`);
  console.log(`  Skipped (dup/empty):    ${skipped}`);
  console.log(`  Errors:                 ${errors}`);
  console.log('');
  console.log('  Database totals:');
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
    console.log('\n✅ Resume import completed successfully!');
  })
  .catch(async (e) => {
    console.error('\n❌ Resume import failed:', e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
