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

const BASE_URL =
  process.env.BASE_URL ||
  'https://ecommerce-prime-backend-production.up.railway.app';

async function main() {
  console.log('🔄 Начало обновления URL изображений...\n');

  // Получаем все изображения с относительными путями
  const images = await prisma.productImage.findMany({
    where: {
      url: {
        startsWith: '/images/',
      },
    },
  });

  console.log(`Найдено ${images.length} изображений для обновления\n`);

  let updated = 0;
  for (const image of images) {
    const newUrl = `${BASE_URL}${image.url}`;

    await prisma.productImage.update({
      where: { id: image.id },
      data: { url: newUrl },
    });

    console.log(`✓ Обновлено: ${image.url} -> ${newUrl}`);
    updated++;
  }

  console.log(`\n✅ Обновлено ${updated} изображений`);
}

main()
  .catch((e) => {
    console.error('Ошибка при обновлении:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
