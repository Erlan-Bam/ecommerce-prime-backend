import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { ProductService } from '../src/product/product.service';

dotenv.config();

type CliOptions = {
  apply: boolean;
  limit: number;
  exclude: string[];
};

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    apply: false,
    limit: 5000,
    exclude: [],
  };

  for (const arg of args) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      if (Number.isFinite(value) && value > 0) {
        options.limit = Math.min(Math.floor(value), 5000);
      }
      continue;
    }

    if (arg.startsWith('--exclude=')) {
      options.exclude.push(
        ...arg
          .slice('--exclude='.length)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
  }

  return options;
}

function createNoopProductCacheService() {
  return {
    invalidateAllCaches: async () => undefined,
    invalidateProduct: async () => undefined,
  };
}

function shouldUseSsl(connectionString: string): boolean {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode === 'require') return true;
  if (sslMode === 'disable') return false;

  return !['localhost', '127.0.0.1', 'host.docker.internal'].includes(
    url.hostname,
  );
}

function printSuggestion(item: any, index: number) {
  const current = (item.currentCategoryPath || []).join(' > ');
  const target = (item.targetCategoryPath || []).join(' > ');
  const skipped = item.skipped ? ' [skipped]' : '';

  console.log(`${index + 1}. ${item.productName}${skipped}`);
  console.log(`   productId: ${item.productId}`);
  console.log(`   from: ${current}`);
  console.log(`   to:   ${target}`);
  console.log(`   why:  ${item.reason}`);
}

async function main() {
  const options = parseCliOptions();
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({
    connectionString,
    ...(shouldUseSsl(connectionString)
      ? { ssl: { rejectUnauthorized: false } }
      : {}),
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
  });

  const service = new ProductService(
    prisma as any,
    createNoopProductCacheService() as any,
  );

  try {
    const result = await service.applyCatalogCleanup({
      dryRun: !options.apply,
      limit: options.limit,
      excludedProductIds: options.exclude,
    });

    console.log('Catalog cleanup');
    console.log(`Mode:       ${options.apply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Scanned:    ${result.scanned}`);
    console.log(`Suggested:  ${result.suggested}`);
    console.log(`Applicable: ${result.applicable}`);
    console.log(`Excluded:   ${result.excluded}`);
    console.log(`Applied:    ${result.applied}`);

    if (result.suggestions.length > 0) {
      console.log('');
      result.suggestions.forEach(printSuggestion);
    }

    if (!options.apply && result.applicable > 0) {
      console.log('');
      console.log('Nothing was changed. Re-run with --apply to write changes.');
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
