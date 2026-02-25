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

const BATCH_SIZE = 100;

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🔧 Fix concatenated product images');
  console.log('═══════════════════════════════════════════════════════════');

  // Find all images that contain a semicolon (concatenated URLs)
  const badImages = await prisma.productImage.findMany({
    where: {
      url: { contains: ';' },
    },
  });

  console.log(`Found ${badImages.length} image records with concatenated URLs`);

  if (badImages.length === 0) {
    console.log('Nothing to fix!');
    return;
  }

  let fixed = 0;
  let errors = 0;

  for (let i = 0; i < badImages.length; i += BATCH_SIZE) {
    const batch = badImages.slice(i, i + BATCH_SIZE);

    for (const image of batch) {
      try {
        const urls = image.url
          .split(';')
          .map((u) => u.trim())
          .filter((u) => u.length > 0);

        if (urls.length <= 1) continue;

        // Extract base alt text (remove " - image N" suffix)
        const baseAlt = image.alt
          ? image.alt.replace(/ - image \d+$/, '')
          : null;

        // Delete the old concatenated record
        await prisma.productImage.delete({
          where: { id: image.id },
        });

        // Create individual image records
        await prisma.productImage.createMany({
          data: urls.map((url, idx) => ({
            productId: image.productId,
            url,
            alt: baseAlt ? `${baseAlt} - image ${idx + 1}` : null,
            sortOrder: idx,
          })),
        });

        fixed++;
      } catch (err: any) {
        errors++;
        if (errors <= 10) {
          console.error(
            `   ❌ Error fixing image ${image.id}: ${err.message?.substring(0, 120)}`,
          );
        }
      }
    }

    console.log(
      `   📊 Progress: ${Math.min(i + BATCH_SIZE, badImages.length)}/${badImages.length} (fixed: ${fixed}, errors: ${errors})`,
    );
  }

  const totalImages = await prisma.productImage.count();

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📊 Fix Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Records with concatenated URLs: ${badImages.length}`);
  console.log(`  Successfully split:             ${fixed}`);
  console.log(`  Errors:                         ${errors}`);
  console.log(`  Total images now:               ${totalImages}`);
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
