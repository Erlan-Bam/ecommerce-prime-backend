import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
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

// Маппинг цветов к файлам изображений
const colorImageMap: { [key: string]: string[] } = {
  'Deep Blue': ['blue.webp', 'blue2.webp'],
  'Cosmic Orange': ['orange.webp', 'orange2.webp'],
  Silver: ['Silver.webp', 'Silver2.webp'],
};

// Функция для извлечения цвета из названия
function extractColor(name: string): string | null {
  for (const color of Object.keys(colorImageMap)) {
    if (name.includes(color)) {
      return color;
    }
  }
  return null;
}

// Функция для извлечения объема памяти
function extractStorage(name: string): string | null {
  const match = name.match(/(\d+)\s*ГБ/);
  return match ? match[1] + ' ГБ' : null;
}

// Функция для копирования изображений
async function copyImages(
  color: string,
  productSlug: string,
): Promise<string[]> {
  const sourceDir = path.join(__dirname, '../src/content/17');
  const destDir = path.join(__dirname, '../public/images/products');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const imageFiles = colorImageMap[color];
  if (!imageFiles) {
    console.log(`Не найдены изображения для цвета: ${color}`);
    return [];
  }

  const copiedImages: string[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const sourceFile = path.join(sourceDir, imageFiles[i]);
    const ext = path.extname(imageFiles[i]);
    const destFile = path.join(destDir, `${productSlug}-${i + 1}${ext}`);

    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, destFile);
      copiedImages.push(`/images/products/${productSlug}-${i + 1}${ext}`);
      console.log(
        `Скопировано: ${imageFiles[i]} -> ${productSlug}-${i + 1}${ext}`,
      );
    } else {
      console.log(`Файл не найден: ${sourceFile}`);
    }
  }

  return copiedImages;
}

// Функция для создания slug
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s-]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function main() {
  console.log('Начало импорта данных из xlsx...\n');

  // Читаем xlsx файл
  const filePath = path.join(__dirname, '../src/content/Лист XLSX.xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`Найдено ${data.length} товаров для импорта\n`);

  // Получаем или создаем категорию "Смартфоны"
  let category = await prisma.category.findUnique({
    where: { slug: 'smartfony' },
  });

  if (!category) {
    category = await prisma.category.create({
      data: {
        title: 'Смартфоны',
        slug: 'smartfony',
        isActive: true,
      },
    });
    console.log('Создана категория: Смартфоны\n');
  }

  // Получаем или создаем бренд Apple
  let brand = await prisma.brand.findUnique({
    where: { slug: 'apple' },
  });

  if (!brand) {
    brand = await prisma.brand.create({
      data: {
        name: 'Apple',
        slug: 'apple',
        isActive: true,
      },
    });
    console.log('Создан бренд: Apple\n');
  }

  // Импортируем каждый товар
  for (const [index, row] of data.entries()) {
    const rowData = row as any;

    const name = rowData['Название товара'];
    const description = rowData['Описание товара'];
    const price = parseFloat(rowData['Цена']);
    const simCard = rowData['SIM-карта'];
    const brandName = rowData['Бренд'];
    const diagonal = rowData['Диоганаль экрана'];
    const processor = rowData['Процессор'];
    const storage = rowData['Объем встроенной памяти'];
    const bundle = rowData['Комплектация'];

    if (!name || !price) {
      console.log(
        `Пропуск строки ${index + 1}: отсутствует название или цена\n`,
      );
      continue;
    }

    console.log(`${index + 1}. Импорт: ${name}`);

    const slug = createSlug(name);
    const color = extractColor(name);

    // Проверяем, существует ли уже товар
    const existingProduct = await prisma.product.findUnique({
      where: { slug },
    });

    if (existingProduct) {
      console.log(`   Товар уже существует, пропуск...\n`);
      continue;
    }

    // Создаем товар
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        brandId: brand.id,
        name,
        slug,
        description: description || '',
        price,
        isActive: true,
        isOnSale: false,
      },
    });

    console.log(`   Создан продукт ID: ${product.id}`);

    // Копируем изображения
    if (color) {
      const imagePaths = await copyImages(color, slug);

      // Создаем записи изображений в БД
      for (let i = 0; i < imagePaths.length; i++) {
        await prisma.productImage.create({
          data: {
            productId: product.id,
            url: imagePaths[i],
            alt: `${name} - фото ${i + 1}`,
            sortOrder: i,
          },
        });
      }

      console.log(`   Добавлено изображений: ${imagePaths.length}`);
    }

    // Создаем атрибуты товара
    const attributes = [];

    if (simCard) {
      attributes.push({ name: 'SIM-карта', value: simCard });
    }
    if (diagonal) {
      attributes.push({ name: 'Диагональ экрана', value: `${diagonal}"` });
    }
    if (processor) {
      attributes.push({ name: 'Процессор', value: processor.trim() });
    }
    if (storage) {
      attributes.push({ name: 'Объем памяти', value: storage.trim() });
    }
    if (color) {
      attributes.push({ name: 'Цвет', value: color });
    }
    if (bundle) {
      attributes.push({ name: 'Комплектация', value: bundle });
    }

    for (const attr of attributes) {
      await prisma.productAttribute.create({
        data: {
          productId: product.id,
          name: attr.name,
          value: attr.value,
        },
      });
    }

    console.log(`   Добавлено атрибутов: ${attributes.length}`);

    // Получаем первую активную точку выдачи для создания записи о наличии
    const pickupPoint = await prisma.pickupPoint.findFirst({
      where: { isActive: true },
    });

    if (pickupPoint) {
      // Создаем запись о наличии товара
      await prisma.productStock.create({
        data: {
          productId: product.id,
          pointId: pickupPoint.id,
          sku: slug, // Используем slug как SKU
          stockCount: 10, // Начальное количество
        },
      });
      console.log(`   Добавлен stock с количеством: 10`);
    } else {
      console.log(`   Пропущено добавление stock - нет активных точек выдачи`);
    }

    console.log(`   Товар успешно импортирован\n`);
  }

  console.log('Импорт завершен!');
}

main()
  .catch((e) => {
    console.error('Ошибка при импорте:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
