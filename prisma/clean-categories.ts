import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

/**
 * Image transfer mapping: slug of 0-product category → slug of real category
 * The image URL from the 0-product category will be copied to the real one.
 */
const IMAGE_TRANSFER_MAP: Record<string, string> = {
  // Apple sub-categories
  'iphone': 'smartfony-apple-iphone',
  'apple-watch': 'chasy-apple-watch',
  'airpods': 'naushniki-apple-airpods-i-beats',
  'imac': 'kompyutery-apple',
  'ipad': 'planshety-apple-ipad',
  'macbook': 'noutbuki-apple',
  'mac-mini': 'multimedia-apple',

  // Samsung sub-categories
  'samsung-galaxy': 'smartfony-serii-galaxy-s',
  'samsung-watch': 'umnye-chasy-samsung',
  'galaxy-buds': 'naushniki-samsung',
  'samsung-tablets': 'planshety-samsung',

  // Xiaomi sub-categories
  'xiaomi-phones': 'smartfony-xiaomi',
  'xiaomi-buds': 'naushniki-i-kolonki-xiaomi',

  // Dyson sub-categories
  'dyson-vacuums': 'besprovodnye-pylesosy-dyson',
  'dyson-aircare': 'ochistiteli-vozduha-dyson',
  'dyson-haircare': 'feny-dyson',
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🧹 Clean Categories');
  console.log('═══════════════════════════════════════════════════════════');

  // ─── Step 1: Delete "Сервис и услуги" category (and its children) ───
  console.log('\n📌 Step 1: Delete "Сервис и услуги" category...');

  const serviceCategory = await prisma.category.findFirst({
    where: {
      OR: [
        { title: { contains: 'Сервис и услуги', mode: 'insensitive' } },
        { title: { contains: 'сервис', mode: 'insensitive' } },
        { slug: { contains: 'servis' } },
        { slug: { contains: 'uslugi' } },
      ],
    },
    include: {
      children: true,
      _count: { select: { products: true } },
    },
  });

  if (serviceCategory) {
    // Delete children first
    if (serviceCategory.children.length > 0) {
      const childIds = serviceCategory.children.map((c) => c.id);
      // Delete product-category links for children
      await prisma.productCategory.deleteMany({
        where: { categoryId: { in: childIds } },
      });
      // Delete children
      await prisma.category.deleteMany({
        where: { id: { in: childIds } },
      });
      console.log(
        `   ✅ Deleted ${childIds.length} children of "${serviceCategory.title}"`,
      );
    }
    // Delete product-category links
    await prisma.productCategory.deleteMany({
      where: { categoryId: serviceCategory.id },
    });
    // Delete the category itself
    await prisma.category.delete({
      where: { id: serviceCategory.id },
    });
    console.log(`   ✅ Deleted "${serviceCategory.title}" (id: ${serviceCategory.id})`);
  } else {
    console.log('   ⚠️  "Сервис и услуги" category not found, skipping.');
  }

  // ─── Step 2: Transfer images from 0-product duplicates to real categories ───
  console.log('\n📌 Step 2: Transfer images from 0-product categories to real ones...');

  let imagesTransferred = 0;
  for (const [fromSlug, toSlug] of Object.entries(IMAGE_TRANSFER_MAP)) {
    const sourceCategory = await prisma.category.findUnique({
      where: { slug: fromSlug },
      include: { _count: { select: { products: true } } },
    });

    if (!sourceCategory) {
      console.log(`   ⏭️  Source "${fromSlug}" not found, skipping.`);
      continue;
    }

    if (sourceCategory._count.products > 0) {
      console.log(
        `   ⏭️  Source "${fromSlug}" has ${sourceCategory._count.products} products, skipping image transfer.`,
      );
      continue;
    }

    if (!sourceCategory.image) {
      console.log(`   ⏭️  Source "${fromSlug}" has no image, skipping.`);
      continue;
    }

    const targetCategory = await prisma.category.findUnique({
      where: { slug: toSlug },
    });

    if (!targetCategory) {
      console.log(`   ⏭️  Target "${toSlug}" not found, skipping.`);
      continue;
    }

    await prisma.category.update({
      where: { id: targetCategory.id },
      data: { image: sourceCategory.image },
    });

    console.log(
      `   🖼️  "${fromSlug}" → "${toSlug}" (image: ${sourceCategory.image.substring(0, 80)}...)`,
    );
    imagesTransferred++;
  }

  console.log(`   ✅ Transferred ${imagesTransferred} images.`);

  // ─── Step 3: Find and delete all 0-product categories with no children ───
  console.log('\n📌 Step 3: Delete 0-product leaf categories...');

  // Get all categories with product counts and children counts
  const allCategories = await prisma.category.findMany({
    include: {
      _count: {
        select: {
          products: true,
          children: true,
        },
      },
    },
  });

  // Categories to delete: 0 products AND 0 children
  const toDelete = allCategories.filter(
    (c) => c._count.products === 0 && c._count.children === 0,
  );

  console.log(
    `   Found ${toDelete.length} categories with 0 products and 0 children:`,
  );

  for (const cat of toDelete) {
    console.log(`     - "${cat.title}" (slug: ${cat.slug})`);
  }

  if (toDelete.length > 0) {
    const idsToDelete = toDelete.map((c) => c.id);

    // Delete product-category links (should be 0, but just in case)
    const deletedLinks = await prisma.productCategory.deleteMany({
      where: { categoryId: { in: idsToDelete } },
    });
    if (deletedLinks.count > 0) {
      console.log(`   🔗 Removed ${deletedLinks.count} product-category links.`);
    }

    // Delete the categories
    const deleted = await prisma.category.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    console.log(`   ✅ Deleted ${deleted.count} empty categories.`);
  }

  // ─── Step 4: Re-check for parent categories that now have 0 children and 0 products ───
  console.log('\n📌 Step 4: Cleanup newly orphaned parent categories...');

  let orphanRound = 1;
  let totalOrphansDeleted = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const orphans = await prisma.category.findMany({
      where: {
        children: { none: {} },
      },
      include: {
        _count: {
          select: { products: true, children: true },
        },
      },
    });

    const orphansToDelete = orphans.filter(
      (c) => c._count.products === 0 && c._count.children === 0,
    );

    if (orphansToDelete.length === 0) break;

    const orphanIds = orphansToDelete.map((c) => c.id);

    await prisma.productCategory.deleteMany({
      where: { categoryId: { in: orphanIds } },
    });

    const deleted = await prisma.category.deleteMany({
      where: { id: { in: orphanIds } },
    });

    console.log(
      `   Round ${orphanRound}: Deleted ${deleted.count} newly orphaned categories.`,
    );
    for (const cat of orphansToDelete) {
      console.log(`     - "${cat.title}" (slug: ${cat.slug})`);
    }

    totalOrphansDeleted += deleted.count;
    orphanRound++;

    // Safety: max 5 rounds
    if (orphanRound > 5) break;
  }

  if (totalOrphansDeleted > 0) {
    console.log(`   ✅ Deleted ${totalOrphansDeleted} orphaned categories total.`);
  } else {
    console.log('   ✅ No orphaned categories found.');
  }

  // ─── Summary ───
  const remainingCount = await prisma.category.count();
  const withProducts = await prisma.category.count({
    where: {
      products: { some: {} },
    },
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊 Cleanup Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Images transferred:        ${imagesTransferred}`);
  console.log(`  Service category deleted:  ${serviceCategory ? 'Yes' : 'Not found'}`);
  console.log(`  Empty categories deleted:  ${toDelete.length + totalOrphansDeleted}`);
  console.log(`  Remaining categories:      ${remainingCount}`);
  console.log(`  Categories with products:  ${withProducts}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
