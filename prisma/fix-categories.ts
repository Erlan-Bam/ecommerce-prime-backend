import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  console.log('🔧 Fixing product categories...\n');

  // Get the iphone and smartphones categories
  const iphone = await prisma.category.findUnique({
    where: { slug: 'iphone' },
  });
  const smartphones = await prisma.category.findUnique({
    where: { slug: 'smartphones' },
  });

  if (!iphone) {
    console.log('❌ iphone category not found');
    return;
  }
  console.log('✅ Found iphone category:', iphone.id);

  if (!smartphones) {
    console.log('❌ smartphones category not found');
    return;
  }
  console.log('✅ Found smartphones category:', smartphones.id);

  // Find all iPhone products that are not in the iPhone category
  const iphoneProducts = await prisma.product.findMany({
    where: {
      name: { contains: 'iPhone' },
      categories: {
        none: { categoryId: iphone.id },
      },
    },
    select: {
      id: true,
      name: true,
      categories: { select: { categoryId: true } },
    },
  });

  console.log(
    `\n📦 Found ${iphoneProducts.length} iPhone products not in iPhone category`,
  );

  if (iphoneProducts.length > 0) {
    // Add iPhone and Smartphones categories to all iPhone products
    for (const product of iphoneProducts) {
      // Add iPhone category (primary)
      await prisma.productCategory.upsert({
        where: {
          productId_categoryId: {
            productId: product.id,
            categoryId: iphone.id,
          },
        },
        update: { isPrimary: true },
        create: {
          productId: product.id,
          categoryId: iphone.id,
          isPrimary: true,
        },
      });

      // Add Smartphones category (secondary)
      await prisma.productCategory.upsert({
        where: {
          productId_categoryId: {
            productId: product.id,
            categoryId: smartphones.id,
          },
        },
        update: {},
        create: {
          productId: product.id,
          categoryId: smartphones.id,
          isPrimary: false,
        },
      });
    }
    console.log(
      `✅ Added ${iphoneProducts.length} products to iphone and smartphones categories`,
    );
  }

  // Count products in iPhone category
  const count = await prisma.productCategory.count({
    where: { categoryId: iphone.id },
  });
  console.log(`\n📊 iPhone category now has ${count} products`);

  // Count products in Smartphones category
  const smartphonesCount = await prisma.productCategory.count({
    where: { categoryId: smartphones.id },
  });
  console.log(`📊 Smartphones category now has ${smartphonesCount} products`);

  console.log('\n🎉 Fix completed!');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ Error:', e);
    prisma.$disconnect();
    process.exit(1);
  });
