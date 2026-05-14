import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config();

const EXCEL_FILE =
  process.argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length) ||
  path.join(__dirname, '..', 'public', 'products.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const raw = process.argv.find((arg) => arg.startsWith('--limit='))?.slice(8);
  const parsed = raw ? Number.parseInt(raw, 10) : null;
  return parsed && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
})();

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

const CONFIGURATION_ATTRIBUTE_NAMES = new Set([
  'конфигурации',
  'конфигурации товара',
  'конфигурации цены',
  'variant configurations',
  'product configurations',
  'configurations',
]);

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  return {
    pool,
    prisma: new PrismaClient({
      adapter: new PrismaPg(pool),
    }),
  };
}

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function normalizeAttributeName(rawName: string): string | null {
  const cleanName = rawName.replace(/\s+/g, ' ').trim();
  if (!cleanName) return null;

  const withoutPrefix = cleanName.replace(/^параметр\s*:\s*/i, '').trim();
  const normalizedName = withoutPrefix || cleanName;
  if (!normalizedName) return null;

  if (TECHNICAL_ATTRIBUTE_COLUMNS.has(normalizeLookupKey(normalizedName))) {
    return null;
  }

  return normalizedName;
}

function isConfigurationAttributeName(name: string): boolean {
  return CONFIGURATION_ATTRIBUTE_NAMES.has(normalizeLookupKey(name));
}

function normalizeAttributes(
  attributes: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  const unique = new Map<string, { name: string; value: string }>();

  for (const attribute of attributes) {
    const name = normalizeAttributeName(attribute.name);
    const value = String(attribute.value || '').trim();
    if (!name || !value) continue;

    const key = normalizeLookupKey(`${name}::${value}`);
    if (!unique.has(key)) unique.set(key, { name, value });
  }

  return Array.from(unique.values());
}

function mergeConfigurationAttributes(
  incoming: Array<{ name: string; value: string }>,
  existing: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  if (incoming.some((attribute) => isConfigurationAttributeName(attribute.name))) {
    return normalizeAttributes(incoming);
  }

  const existingConfigurations = existing.filter((attribute) =>
    isConfigurationAttributeName(attribute.name),
  );

  return normalizeAttributes([...incoming, ...existingConfigurations]);
}

function slugify(text: string): string {
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

  return (
    text
      .toLowerCase()
      .split('')
      .map((char) => translitMap[char] ?? char)
      .join('')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || `product-${Date.now()}`
  );
}

function readRows(filePath: string): Record<string, unknown>[] {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error(`No sheets found in ${filePath}`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[firstSheetName],
    { defval: '' },
  );
}

function extractIncomingAttributes(row: Record<string, unknown>) {
  return normalizeAttributes(
    Object.entries(row)
      .filter(([key, value]) => !PRODUCT_FIELD_COLUMNS.has(key) && value)
      .map(([name, value]) => ({ name, value: String(value) })),
  );
}

async function main() {
  const { prisma, pool } = createPrismaClient();
  const rows = readRows(EXCEL_FILE);
  const selectedRows = LIMIT ? rows.slice(0, LIMIT) : rows;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Technodeus attributes backfill');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Файл: ${EXCEL_FILE}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Строк: ${selectedRows.length}`);
  console.log('');

  let matched = 0;
  let updated = 0;
  let skippedNoAttributes = 0;
  let notFound = 0;

  try {
    for (let index = 0; index < selectedRows.length; index += 1) {
      const row = selectedRows[index];
      const name = String(row['Название'] || '').trim();
      if (!name) continue;

      const incomingAttributes = extractIncomingAttributes(row);
      if (incomingAttributes.length === 0) {
        skippedNoAttributes += 1;
        continue;
      }

      const sku = String(row['Артикул'] || '').trim();
      const slugCandidates = Array.from(
        new Set([slugify(name), sku ? `product-${sku}` : ''].filter(Boolean)),
      );

      const product = await prisma.product.findFirst({
        where: { slug: { in: slugCandidates } },
        select: {
          id: true,
          slug: true,
          attributes: { select: { name: true, value: true } },
        },
      });

      if (!product) {
        notFound += 1;
        continue;
      }

      matched += 1;
      const attributes = mergeConfigurationAttributes(
        incomingAttributes,
        product.attributes,
      );

      if (!DRY_RUN) {
        await prisma.$transaction(async (tx) => {
          await tx.productAttribute.deleteMany({
            where: { productId: product.id },
          });
          await tx.productAttribute.createMany({
            data: attributes.map((attribute) => ({
              productId: product.id,
              name: attribute.name,
              value: attribute.value,
            })),
          });
        });
      }

      updated += 1;
      if (updated % 100 === 0 || updated === selectedRows.length) {
        console.log(`   Progress: ${updated}/${selectedRows.length}`);
      }
    }

    console.log('');
    console.log(`Matched: ${matched}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped without attributes: ${skippedNoAttributes}`);
    console.log(`Not found: ${notFound}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
