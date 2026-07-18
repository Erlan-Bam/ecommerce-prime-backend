import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

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

// Base URL for static images
const BASE_URL = 'https://api.prime-electronics.ru';

// Product images - using the 4 provided images
const PRODUCT_IMAGES = [
  `${BASE_URL}/images/products/product-1.png`,
  `${BASE_URL}/images/products/product-2.png`,
  `${BASE_URL}/images/products/product-3.png`,
  `${BASE_URL}/images/products/product-4.png`,
];

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

  // Apple subcategories (internet images)
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

  // Samsung subcategories (internet images)
  'samsung-galaxy':
    'https://fdn2.gsmarena.com/vv/pics/samsung/samsung-galaxy-s24-ultra-5g-sm-s928-0.jpg',
  'samsung-watch':
    'https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-watch6.jpg',
  'galaxy-buds': `${BASE_URL}/images/categories/headphones.png`,
  'samsung-tablets':
    'https://fdn2.gsmarena.com/vv/bigpic/samsung-galaxy-tab-s9-5g.jpg',

  // Xiaomi subcategories (internet images)
  'xiaomi-phones':
    'https://fdn2.gsmarena.com/vv/bigpic/xiaomi-14.jpg',
  'xiaomi-watch':
    'https://fdn2.gsmarena.com/vv/bigpic/xiaomi-watch-2-pro.jpg',
  'xiaomi-buds': `${BASE_URL}/images/categories/headphones.png`,

  // Dyson subcategories (internet images)
  'dyson-vacuums':
    'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/394472-01.png',
  'dyson-aircare':
    'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/369535-01.png',
  'dyson-haircare':
    'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/426081-01.png',
};

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');

  // Use raw SQL to truncate tables with CASCADE to handle foreign key constraints
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductAttribute" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductImage" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ProductStock" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "Review" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "OrderItem" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "Order" CASCADE');
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Product" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "Category" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "Brand" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "PickupWindow" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "PickupPoint" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "Bonus" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "Coupon" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "Favorite" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "GuestSession" CASCADE');
  // await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');

  // Create admin user
  console.log('👤 Creating admin user...');
  const hashedPassword = 'Prime_MSK25$@';

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'prime.msk25@gmail.com' },
  });

  let admin;
  if (existingAdmin) {
    console.log('ℹ️ Admin user already exists:', existingAdmin.email);
    admin = existingAdmin;
  } else {
    admin = await prisma.user.create({
      data: {
        email: 'prime.msk25@gmail.com',
        phone: '+77001234567',
        password: hashedPassword,
        name: 'Admin User',
        role: Role.ADMIN,
      },
    });
    console.log('✅ Admin user created:', admin.email);
  }

  // Create test user
  const existingTestUser = await prisma.user.findUnique({
    where: { email: 'user@ecommerce.com' },
  });

  let testUser;
  if (existingTestUser) {
    console.log('ℹ️ Test user already exists:', existingTestUser.email);
    testUser = existingTestUser;
  } else {
    testUser = await prisma.user.create({
      data: {
        email: 'user@ecommerce.com',
        phone: '+77007654321',
        password: await bcrypt.hash('user123', 10),
        name: 'Test User',
        role: Role.USER,
      },
    });
    console.log('✅ Test user created:', testUser.email);
  }

  // Create Brands
  console.log('🏷️ Creating brands...');
  const brandsData = [
    { name: 'Apple', slug: 'apple', logo: '/images/brands/apple.png' },
    { name: 'Samsung', slug: 'samsung', logo: '/images/brands/samsung.png' },
    { name: 'Xiaomi', slug: 'xiaomi', logo: '/images/brands/xiaomi.png' },
    { name: 'Dyson', slug: 'dyson', logo: '/images/brands/dyson.png' },
    { name: 'Sony', slug: 'sony', logo: '/images/brands/sony.png' },
    { name: 'JBL', slug: 'jbl', logo: '/images/brands/jbl.png' },
    { name: 'Huawei', slug: 'huawei', logo: '/images/brands/huawei.png' },
    { name: 'Google', slug: 'google', logo: '/images/brands/google.png' },
  ];

  const brands: Record<string, any> = {};
  for (const brand of brandsData) {
    brands[brand.slug] = await prisma.brand.upsert({
      where: { name: brand.name },
      update: brand,
      create: brand,
    });
  }

  // Create Categories
  console.log('📁 Creating categories...');

  // Parent categories
  const apple = await prisma.category.upsert({
    where: { slug: 'apple' },
    update: {
      title: 'Apple',
      image: CATEGORY_IMAGES['apple'],
      sortOrder: 1,
    },
    create: {
      title: 'Apple',
      slug: 'apple',
      image: CATEGORY_IMAGES['apple'],
      sortOrder: 1,
    },
  });

  const samsung = await prisma.category.upsert({
    where: { slug: 'samsung' },
    update: {
      title: 'Samsung',
      image: CATEGORY_IMAGES['samsung'],
      sortOrder: 2,
    },
    create: {
      title: 'Samsung',
      slug: 'samsung',
      image: CATEGORY_IMAGES['samsung'],
      sortOrder: 2,
    },
  });

  const xiaomi = await prisma.category.upsert({
    where: { slug: 'xiaomi' },
    update: {
      title: 'Xiaomi',
      image: CATEGORY_IMAGES['xiaomi'],
      sortOrder: 3,
    },
    create: {
      title: 'Xiaomi',
      slug: 'xiaomi',
      image: CATEGORY_IMAGES['xiaomi'],
      sortOrder: 3,
    },
  });

  const dyson = await prisma.category.upsert({
    where: { slug: 'dyson' },
    update: {
      title: 'Dyson',
      image: CATEGORY_IMAGES['dyson'],
      sortOrder: 4,
    },
    create: {
      title: 'Dyson',
      slug: 'dyson',
      image: CATEGORY_IMAGES['dyson'],
      sortOrder: 4,
    },
  });

  const smartphones = await prisma.category.upsert({
    where: { slug: 'smartphones' },
    update: {
      title: 'Смартфоны',
      image: CATEGORY_IMAGES['smartphones'],
      sortOrder: 5,
    },
    create: {
      title: 'Смартфоны',
      slug: 'smartphones',
      image: CATEGORY_IMAGES['smartphones'],
      sortOrder: 5,
    },
  });

  const laptops = await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {
      title: 'Ноутбуки',
      image: CATEGORY_IMAGES['laptops'],
      sortOrder: 6,
    },
    create: {
      title: 'Ноутбуки',
      slug: 'laptops',
      image: CATEGORY_IMAGES['laptops'],
      sortOrder: 6,
    },
  });

  const watches = await prisma.category.upsert({
    where: { slug: 'smart-watches' },
    update: {
      title: 'Умные часы',
      image: CATEGORY_IMAGES['smart-watches'],
      sortOrder: 7,
    },
    create: {
      title: 'Умные часы',
      slug: 'smart-watches',
      image: CATEGORY_IMAGES['smart-watches'],
      sortOrder: 7,
    },
  });

  const headphones = await prisma.category.upsert({
    where: { slug: 'headphones' },
    update: {
      title: 'Наушники',
      image: CATEGORY_IMAGES['headphones'],
      sortOrder: 8,
    },
    create: {
      title: 'Наушники',
      slug: 'headphones',
      image: CATEGORY_IMAGES['headphones'],
      sortOrder: 8,
    },
  });

  const gamingConsoles = await prisma.category.upsert({
    where: { slug: 'gaming-consoles' },
    update: {
      title: 'Игровые приставки',
      image: CATEGORY_IMAGES['gaming-consoles'],
      sortOrder: 9,
    },
    create: {
      title: 'Игровые приставки',
      slug: 'gaming-consoles',
      image: CATEGORY_IMAGES['gaming-consoles'],
      sortOrder: 9,
    },
  });

  const accessories = await prisma.category.upsert({
    where: { slug: 'accessories' },
    update: {
      title: 'Аксессуары',
      image: CATEGORY_IMAGES['accessories'],
      sortOrder: 10,
    },
    create: {
      title: 'Аксессуары',
      slug: 'accessories',
      image: CATEGORY_IMAGES['accessories'],
      sortOrder: 10,
    },
  });

  // Subcategories for Apple
  const iphoneCategory = await prisma.category.upsert({
    where: { slug: 'iphone' },
    update: {
      title: 'iPhone',
      parentId: apple.id,
      image: CATEGORY_IMAGES['iphone'],
      sortOrder: 1,
    },
    create: {
      title: 'iPhone',
      slug: 'iphone',
      parentId: apple.id,
      image: CATEGORY_IMAGES['iphone'],
      sortOrder: 1,
    },
  });

  const appleWatch = await prisma.category.upsert({
    where: { slug: 'apple-watch' },
    update: {
      title: 'Apple Watch',
      parentId: apple.id,
      image: CATEGORY_IMAGES['apple-watch'],
      sortOrder: 2,
    },
    create: {
      title: 'Apple Watch',
      slug: 'apple-watch',
      parentId: apple.id,
      image: CATEGORY_IMAGES['apple-watch'],
      sortOrder: 2,
    },
  });

  const airpods = await prisma.category.upsert({
    where: { slug: 'airpods' },
    update: {
      title: 'AirPods',
      parentId: apple.id,
      image: CATEGORY_IMAGES['airpods'],
      sortOrder: 3,
    },
    create: {
      title: 'AirPods',
      slug: 'airpods',
      parentId: apple.id,
      image: CATEGORY_IMAGES['airpods'],
      sortOrder: 3,
    },
  });

  const imac = await prisma.category.upsert({
    where: { slug: 'imac' },
    update: {
      title: 'iMac',
      parentId: apple.id,
      image: CATEGORY_IMAGES['imac'],
      sortOrder: 4,
    },
    create: {
      title: 'iMac',
      slug: 'imac',
      parentId: apple.id,
      image: CATEGORY_IMAGES['imac'],
      sortOrder: 4,
    },
  });

  const ipad = await prisma.category.upsert({
    where: { slug: 'ipad' },
    update: {
      title: 'iPad',
      parentId: apple.id,
      image: CATEGORY_IMAGES['ipad'],
      sortOrder: 5,
    },
    create: {
      title: 'iPad',
      slug: 'ipad',
      parentId: apple.id,
      image: CATEGORY_IMAGES['ipad'],
      sortOrder: 5,
    },
  });

  const macbook = await prisma.category.upsert({
    where: { slug: 'macbook' },
    update: {
      title: 'MacBook',
      parentId: apple.id,
      image: CATEGORY_IMAGES['macbook'],
      sortOrder: 6,
    },
    create: {
      title: 'MacBook',
      slug: 'macbook',
      parentId: apple.id,
      image: CATEGORY_IMAGES['macbook'],
      sortOrder: 6,
    },
  });

  const macMini = await prisma.category.upsert({
    where: { slug: 'mac-mini' },
    update: {
      title: 'Mac mini',
      parentId: apple.id,
      image: CATEGORY_IMAGES['mac-mini'],
      sortOrder: 7,
    },
    create: {
      title: 'Mac mini',
      slug: 'mac-mini',
      parentId: apple.id,
      image: CATEGORY_IMAGES['mac-mini'],
      sortOrder: 7,
    },
  });

  // Subcategories for Samsung
  const samsungPhones = await prisma.category.upsert({
    where: { slug: 'samsung-galaxy' },
    update: {
      title: 'Samsung Galaxy',
      parentId: samsung.id,
      image: CATEGORY_IMAGES['samsung-galaxy'],
      sortOrder: 1,
    },
    create: {
      title: 'Samsung Galaxy',
      slug: 'samsung-galaxy',
      parentId: samsung.id,
      image: CATEGORY_IMAGES['samsung-galaxy'],
      sortOrder: 1,
    },
  });

  const samsungWatch = await prisma.category.upsert({
    where: { slug: 'samsung-watch' },
    update: {
      title: 'Samsung Galaxy Watch',
      parentId: samsung.id,
      image: CATEGORY_IMAGES['samsung-watch'],
      sortOrder: 2,
    },
    create: {
      title: 'Samsung Galaxy Watch',
      slug: 'samsung-watch',
      parentId: samsung.id,
      image: CATEGORY_IMAGES['samsung-watch'],
      sortOrder: 2,
    },
  });

  const galaxyBuds = await prisma.category.upsert({
    where: { slug: 'galaxy-buds' },
    update: {
      title: 'Galaxy Buds',
      parentId: samsung.id,
      image: CATEGORY_IMAGES['galaxy-buds'],
      sortOrder: 3,
    },
    create: {
      title: 'Galaxy Buds',
      slug: 'galaxy-buds',
      parentId: samsung.id,
      image: CATEGORY_IMAGES['galaxy-buds'],
      sortOrder: 3,
    },
  });

  const samsungTablets = await prisma.category.upsert({
    where: { slug: 'samsung-tablets' },
    update: {
      title: 'Samsung Tablets',
      parentId: samsung.id,
      image: CATEGORY_IMAGES['samsung-tablets'],
      sortOrder: 4,
    },
    create: {
      title: 'Samsung Tablets',
      slug: 'samsung-tablets',
      parentId: samsung.id,
      image: CATEGORY_IMAGES['samsung-tablets'],
      sortOrder: 4,
    },
  });

  // Subcategories for Xiaomi
  const xiaomiPhones = await prisma.category.upsert({
    where: { slug: 'xiaomi-phones' },
    update: {
      title: 'Xiaomi Phones',
      parentId: xiaomi.id,
      image: CATEGORY_IMAGES['xiaomi-phones'],
      sortOrder: 1,
    },
    create: {
      title: 'Xiaomi Phones',
      slug: 'xiaomi-phones',
      parentId: xiaomi.id,
      image: CATEGORY_IMAGES['xiaomi-phones'],
      sortOrder: 1,
    },
  });

  const xiaomiWatch = await prisma.category.upsert({
    where: { slug: 'xiaomi-watch' },
    update: {
      title: 'Xiaomi Watch',
      parentId: xiaomi.id,
      image: CATEGORY_IMAGES['xiaomi-watch'],
      sortOrder: 2,
    },
    create: {
      title: 'Xiaomi Watch',
      slug: 'xiaomi-watch',
      parentId: xiaomi.id,
      image: CATEGORY_IMAGES['xiaomi-watch'],
      sortOrder: 2,
    },
  });

  const xiaomiBuds = await prisma.category.upsert({
    where: { slug: 'xiaomi-buds' },
    update: {
      title: 'Xiaomi Buds',
      parentId: xiaomi.id,
      image: CATEGORY_IMAGES['xiaomi-buds'],
      sortOrder: 3,
    },
    create: {
      title: 'Xiaomi Buds',
      slug: 'xiaomi-buds',
      parentId: xiaomi.id,
      image: CATEGORY_IMAGES['xiaomi-buds'],
      sortOrder: 3,
    },
  });

  // Subcategories for Dyson
  const dysonVacuums = await prisma.category.upsert({
    where: { slug: 'dyson-vacuums' },
    update: {
      title: 'Dyson Vacuums',
      parentId: dyson.id,
      image: CATEGORY_IMAGES['dyson-vacuums'],
      sortOrder: 1,
    },
    create: {
      title: 'Dyson Vacuums',
      slug: 'dyson-vacuums',
      parentId: dyson.id,
      image: CATEGORY_IMAGES['dyson-vacuums'],
      sortOrder: 1,
    },
  });

  const dysonAircare = await prisma.category.upsert({
    where: { slug: 'dyson-aircare' },
    update: {
      title: 'Dyson Aircare',
      parentId: dyson.id,
      image: CATEGORY_IMAGES['dyson-aircare'],
      sortOrder: 2,
    },
    create: {
      title: 'Dyson Aircare',
      slug: 'dyson-aircare',
      parentId: dyson.id,
      image: CATEGORY_IMAGES['dyson-aircare'],
      sortOrder: 2,
    },
  });

  const dysonHaircare = await prisma.category.upsert({
    where: { slug: 'dyson-haircare' },
    update: {
      title: 'Dyson Haircare',
      parentId: dyson.id,
      image: CATEGORY_IMAGES['dyson-haircare'],
      sortOrder: 3,
    },
    create: {
      title: 'Dyson Haircare',
      slug: 'dyson-haircare',
      parentId: dyson.id,
      image: CATEGORY_IMAGES['dyson-haircare'],
      sortOrder: 3,
    },
  });

  // Create Pickup Points
  console.log('📍 Creating pickup points...');
  let pickupPoint = await prisma.pickupPoint.findFirst({
    where: { address: 'г. Москва, улица Барклая, 6Ак1' },
  });

  if (pickupPoint) {
    pickupPoint = await prisma.pickupPoint.update({
      where: { id: pickupPoint.id },
      data: {
        name: 'Prime Electronics на Барклая',
        address: 'г. Москва, улица Барклая, 6Ак1',
        coords: '55.7422671,37.4992178',
        workingSchedule: {
          Пн: { from: '11:00', to: '21:00' },
          Вт: { from: '11:00', to: '21:00' },
          Ср: { from: '11:00', to: '21:00' },
          Чт: { from: '11:00', to: '21:00' },
          Пт: { from: '11:00', to: '21:00' },
          Сб: { from: '11:00', to: '21:00' },
          Вс: { from: '11:00', to: '21:00' },
        },
        isActive: true,
      },
    });
  } else {
    pickupPoint = await prisma.pickupPoint.create({
      data: {
        name: 'Prime Electronics на Барклая',
        address: 'г. Москва, улица Барклая, 6Ак1',
        coords: '55.7422671,37.4992178',
        workingSchedule: {
          Пн: { from: '11:00', to: '21:00' },
          Вт: { from: '11:00', to: '21:00' },
          Ср: { from: '11:00', to: '21:00' },
          Чт: { from: '11:00', to: '21:00' },
          Пт: { from: '11:00', to: '21:00' },
          Сб: { from: '11:00', to: '21:00' },
          Вс: { from: '11:00', to: '21:00' },
        },
        isActive: true,
      },
    });
  }

  await prisma.pickupPoint.updateMany({
    where: { id: { not: pickupPoint.id } },
    data: { isActive: false },
  });

  // Create Products
  console.log('📦 Creating products...');

  // Real product image URLs - COMMENTED OUT, USING PROVIDED IMAGES
  /* const productImages = {
    // iPhone images
    iphone15ProMax: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-max-black-titanium-select?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-max-blue-titanium-select?wid=800&hei=800',
    ],
    iphone15Pro: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-white-titanium-select?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-natural-titanium-select?wid=800&hei=800',
    ],
    iphone15: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pink-select-202309?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-blue-select-202309?wid=800&hei=800',
    ],
    iphone14: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-14-blue-select-202209?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-14-purple-select-202209?wid=800&hei=800',
    ],
    // Apple Watch images
    appleWatchUltra: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-ultra-2-702702?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MWFQ3_VW_34FR+watch-49-titanium-702702?wid=800&hei=800',
    ],
    appleWatchS9: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-s9-702702?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MRJ83_VW_34FR+watch-45-702702?wid=800&hei=800',
    ],
    appleWatchSE: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-se-702702?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MRE73_VW_34FR+watch-40-702702?wid=800&hei=800',
    ],
    // AirPods images
    airpodsPro: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-pro-2-hero-select-202209?wid=800&hei=800',
    ],
    airpodsMax: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-max-select-spacegray-202011?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-max-select-silver-202011?wid=800&hei=800',
    ],
    airpods3: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MME73?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-3rd-gen-202209?wid=800&hei=800',
    ],
    // iMac images
    imac24: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/imac-24-blue-selection-702702?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/imac-24-silver-selection-702702?wid=800&hei=800',
    ],
    // iPad images
    ipadPro: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-pro-13-select-wifi-spacegray-202210?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-pro-11-select-wifi-spacegray-202210?wid=800&hei=800',
    ],
    ipadAir: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-select-wifi-blue-202203?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-select-wifi-purple-202203?wid=800&hei=800',
    ],
    // MacBook images
    macbookPro: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp-14-spacegray-select-202310?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp-16-spacegray-select-202310?wid=800&hei=800',
    ],
    macbookAir: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba15-midnight-select-202306?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba15-starlight-select-202306?wid=800&hei=800',
    ],
    // Mac mini images
    macMini: [
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mac-mini-hero-202301?wid=800&hei=800',
      'https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mac-mini-202301-gallery-1?wid=800&hei=800',
    ],
    // Samsung images
    samsungS24Ultra: [
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2401/gallery/kz-galaxy-s24-ultra-491023-sm-s928bztqskz-thumb-539581066',
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2401/gallery/kz-galaxy-s24-ultra-491033-sm-s928bztqskz-thumb-539581078',
    ],
    samsungS24: [
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2401/gallery/kz-galaxy-s24-490975-sm-s921bzyqskz-thumb-539580842',
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2401/gallery/kz-galaxy-s24-490985-sm-s921bzyqskz-thumb-539580854',
    ],
    samsungFold: [
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2307/gallery/kz-galaxy-z-fold5-f946-sm-f946blbgskz-thumb-537344676',
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2307/gallery/kz-galaxy-z-fold5-f946-sm-f946blbgskz-thumb-537344688',
    ],
    galaxyWatch6: [
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2307/gallery/kz-galaxy-watch6-classic-r960-sm-r960nzkaskz-thumb-537200788',
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2307/gallery/kz-galaxy-watch6-classic-r960-sm-r960nzkaskz-thumb-537200800',
    ],
    galaxyBuds2Pro: [
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2208/gallery/kz-galaxy-buds2-pro-r510-sm-r510nlvaskz-thumb-533469930',
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2208/gallery/kz-galaxy-buds2-pro-r510-sm-r510nlvaskz-thumb-533469942',
    ],
    galaxyTabS9: [
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2307/gallery/kz-galaxy-tab-s9-ultra-x916-sm-x916bzaaskz-thumb-537223696',
      'https://images.samsung.com/is/image/samsung/p6pim/kz/2307/gallery/kz-galaxy-tab-s9-ultra-x916-sm-x916bzaaskz-thumb-537223708',
    ],
    // Xiaomi images
    xiaomi14Ultra: [
      'https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1708420047.02917706.png',
      'https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1708420047.16427089.png',
    ],
    xiaomi14: [
      'https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1702358588.41099372.png',
      'https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1702358588.54458731.png',
    ],
    xiaomiWatch: [
      'https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1695611611.84149759.png',
      'https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1695611611.97483541.png',
    ],
    xiaomiBuds: [
      'https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1695611538.67895234.png',
      'https://i01.appmifile.com/v1/MI_18455B3E4DA706226CF7535A58E875F0267/pms_1695611538.81236785.png',
    ],
    // Dyson images
    dysonV15: [
      'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/419232-01.png',
      'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/secondary/419232-01.png',
    ],
    dysonPurifier: [
      'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/438031-01.png',
      'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/secondary/438031-01.png',
    ],
    dysonSupersonic: [
      'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/426081-01.png',
      'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/secondary/426081-01.png',
    ],
    dysonAirwrap: [
      'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/primary/400714-01.png',
      'https://dyson-h.assetsadobe2.com/is/image/content/dam/dyson/images/products/secondary/400714-01.png',
    ],
    // Google Pixel images
    pixel8Pro: [
      'https://lh3.googleusercontent.com/5QJmNxVD0VJkGvL7LhWRLDk_jjQ1Zc8Cx-j9CL_5_-J5mJ5mZ5mJ5mJ5mZ5mJ5mJ5m',
      'https://lh3.googleusercontent.com/5QJmNxVD0VJkGvL7LhWRLDk_jjQ1Zc8Cx-j9CL_5_-J5mJ5mZ5mJ5mJ5mZ5mJ5mJ5m',
    ],
    pixelWatch: [
      'https://lh3.googleusercontent.com/5QJmNxVD0VJkGvL7LhWRLDk_jjQ1Zc8Cx-j9CL_5_-J5mJ5mZ5mJ5mJ5mZ5mJ5mJ5m',
      'https://lh3.googleusercontent.com/5QJmNxVD0VJkGvL7LhWRLDk_jjQ1Zc8Cx-j9CL_5_-J5mJ5mZ5mJ5mJ5mZ5mJ5mJ5m',
    ],
    // Huawei images
    huaweiMate60: [
      'https://consumer.huawei.com/content/dam/huawei-cbg-site/common/mkt/pdp/phones/mate60-pro/img/list/mate60-pro-green.png',
      'https://consumer.huawei.com/content/dam/huawei-cbg-site/common/mkt/pdp/phones/mate60-pro/img/list/mate60-pro-black.png',
    ],
    huaweiMatebook: [
      'https://consumer.huawei.com/content/dam/huawei-cbg-site/common/mkt/pdp/pc/matebook-x-pro-2024/img/list/matebook-x-pro-2024-morandi-blue.png',
      'https://consumer.huawei.com/content/dam/huawei-cbg-site/common/mkt/pdp/pc/matebook-x-pro-2024/img/list/matebook-x-pro-2024-dark-green.png',
    ],
    huaweiWatch: [
      'https://consumer.huawei.com/content/dam/huawei-cbg-site/common/mkt/pdp/wearables/watch-gt4/img/list/watch-gt4-46mm-brown.png',
      'https://consumer.huawei.com/content/dam/huawei-cbg-site/common/mkt/pdp/wearables/watch-gt4/img/list/watch-gt4-46mm-black.png',
    ],
    // Sony images
    sonyWH1000XM5: [
      'https://sony.scene7.com/is/image/sonyglobalsolutions/WH-1000XM5_B_Primary?$categorypdpnav$',
      'https://sony.scene7.com/is/image/sonyglobalsolutions/WH-1000XM5_B_Back?$categorypdpnav$',
    ],
    sonyWF1000XM5: [
      'https://sony.scene7.com/is/image/sonyglobalsolutions/WF-1000XM5_B_Primary?$categorypdpnav$',
      'https://sony.scene7.com/is/image/sonyglobalsolutions/WF-1000XM5_B_Back?$categorypdpnav$',
    ],
    // JBL images
    jblParty: [
      'https://www.jbl.com/dw/image/v2/AAUJ_PRD/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw7c6c8b5b/JBL_PARTYBOX_710_HERO.png',
      'https://www.jbl.com/dw/image/v2/AAUJ_PRD/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw7c6c8b5b/JBL_PARTYBOX_710_BACK.png',
    ],
    jblFlip: [
      'https://www.jbl.com/dw/image/v2/AAUJ_PRD/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw7c6c8b5b/JBL_FLIP_6_HERO_BLACK.png',
      'https://www.jbl.com/dw/image/v2/AAUJ_PRD/on/demandware.static/-/Sites-masterCatalog_Harman/default/dw7c6c8b5b/JBL_FLIP_6_BACK_BLACK.png',
    ],
  }; */

  // Helper function to generate products for a category (supports multiple categories)
  const generateProducts = (
    categoryIds: string | string[], // Can be single categoryId or array of categoryIds
    brandId: string,
    baseName: string,
    baseSlug: string,
    baseDescription: string,
    basePrice: number,
    images: string[], // This parameter is now ignored, using PRODUCT_IMAGES instead
    count: number = 40,
    attributesTemplate: { name: string; values: string[] }[] = [],
  ) => {
    const categoryIdsArray = Array.isArray(categoryIds)
      ? categoryIds
      : [categoryIds];
    const products = [];
    const colors = [
      'Black',
      'White',
      'Silver',
      'Gold',
      'Blue',
      'Green',
      'Purple',
      'Red',
    ];
    const storages = ['64GB', '128GB', '256GB', '512GB', '1TB'];

    for (let i = 1; i <= count; i++) {
      const color = colors[i % colors.length];
      const storage = storages[i % storages.length];
      const priceVariation = Math.floor(Math.random() * 50000) - 25000;
      const isOnSale = i % 5 === 0;
      const hasOldPrice = isOnSale || i % 3 === 0;

      const attributes = attributesTemplate.map((attr) => ({
        name: attr.name,
        value: attr.values[i % attr.values.length],
      }));

      if (!attributes.find((a) => a.name === 'Цвет')) {
        attributes.push({ name: 'Цвет', value: color });
      }

      products.push({
        categoryIds: categoryIdsArray,
        brandId,
        name: `${baseName} ${storage} ${color}`,
        slug: `${baseSlug}-${storage.toLowerCase()}-${color.toLowerCase()}-${i}`,
        description: `${baseDescription} Вариант ${i} в цвете ${color}.`,
        price: basePrice + priceVariation + storages.indexOf(storage) * 20000,
        oldPrice: hasOldPrice ? basePrice + priceVariation + 30000 : null,
        isOnSale,
        images: PRODUCT_IMAGES.map((url, idx) => ({
          url,
          alt: `${baseName} ${color} - Image ${idx + 1}`,
        })),
        attributes,
      });
    }
    return products;
  };

  const productsData =
    !iphoneCategory || !brands.apple
      ? []
      : [
          // ==================== APPLE PRODUCTS ====================
          // iPhones - Real iPhone 17 products
          ...generateProducts(
            [apple.id, iphoneCategory.id, smartphones.id],
            brands.apple.id,
            'iPhone 17 Pro Max 512 ГБ',
            'iphone-17-pro-max-512',
            'Смартфон Apple iPhone 17 Pro Max с 512 ГБ памяти, Deep Blue, Dual: 2 eSim',
            899990,
            PRODUCT_IMAGES,
            3,
            [
              { name: 'Процессор', values: ['A18 Pro'] },
              { name: 'Диагональ экрана', values: ['6.9"'] },
              { name: 'Объем памяти', values: ['512 ГБ'] },
              { name: 'SIM-карта', values: ['Dual: 2 eSim'] },
              {
                name: 'Цвет',
                values: ['Deep Blue', 'Cosmic Orange', 'Silver'],
              },
            ],
          ),
          ...generateProducts(
            [apple.id, iphoneCategory.id, smartphones.id],
            brands.apple.id,
            'iPhone 17 Pro Max 256 ГБ',
            'iphone-17-pro-max-256',
            'Смартфон Apple iPhone 17 Pro Max с 256 ГБ памяти, Deep Blue, Dual: 2 eSim',
            799990,
            PRODUCT_IMAGES,
            3,
            [
              { name: 'Процессор', values: ['A18 Pro'] },
              { name: 'Диагональ экрана', values: ['6.9"'] },
              { name: 'Объем памяти', values: ['256 ГБ'] },
              { name: 'SIM-карта', values: ['Dual: 2 eSim'] },
              {
                name: 'Цвет',
                values: ['Deep Blue', 'Cosmic Orange', 'Silver'],
              },
            ],
          ),
          ...generateProducts(
            [apple.id, iphoneCategory.id, smartphones.id],
            brands.apple.id,
            'iPhone 17 Pro 256 ГБ',
            'iphone-17-pro-256',
            'Смартфон Apple iPhone 17 Pro с 256 ГБ памяти, Deep Blue, Dual: 2 eSim',
            699990,
            PRODUCT_IMAGES,
            3,
            [
              { name: 'Процессор', values: ['A18 Pro'] },
              { name: 'Диагональ экрана', values: ['6.3"'] },
              { name: 'Объем памяти', values: ['256 ГБ'] },
              { name: 'SIM-карта', values: ['Dual: 2 eSim'] },
              {
                name: 'Цвет',
                values: ['Deep Blue', 'Cosmic Orange', 'Silver'],
              },
            ],
          ),
          /* COMMENTED OUT - OTHER PRODUCTS
          ...generateProducts(
            iphoneCategory.id,
            brands.apple.id,
            'iPhone 15 Pro',
            'iphone-15-pro',
            'Титановый дизайн, чип A17 Pro и система камер Pro.',
            549990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Процессор', values: ['A17 Pro'] },
              { name: 'Диагональ', values: ['6.1"'] },
            ],
          ),
          ...generateProducts(
            iphoneCategory.id,
            brands.apple.id,
            'iPhone 15',
            'iphone-15',
            'Dynamic Island, 48-мегапиксельная камера и USB-C.',
            449990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Процессор', values: ['A16 Bionic'] },
              { name: 'Диагональ', values: ['6.1"'] },
            ],
          ),
          ...generateProducts(
            iphoneCategory.id,
            brands.apple.id,
            'iPhone 14',
            'iphone-14',
            'Отличный смартфон с чипом A15 Bionic.',
            349990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Процессор', values: ['A15 Bionic'] },
              { name: 'Диагональ', values: ['6.1"'] },
            ],
          ),

          // Apple Watch - 40 products
          ...generateProducts(
            appleWatch.id,
            brands.apple.id,
            'Apple Watch Ultra 2',
            'apple-watch-ultra-2',
            'Самые прочные Apple Watch для экстремальных условий.',
            399990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Размер', values: ['49mm'] },
              { name: 'Материал', values: ['Титан'] },
              { name: 'GPS', values: ['GPS + Cellular'] },
            ],
          ),
          ...generateProducts(
            appleWatch.id,
            brands.apple.id,
            'Apple Watch Series 9',
            'apple-watch-series-9',
            'Умные часы с двойным касанием и ярким дисплеем.',
            249990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Размер', values: ['41mm', '45mm'] },
              { name: 'GPS', values: ['GPS', 'GPS + Cellular'] },
            ],
          ),
          ...generateProducts(
            appleWatch.id,
            brands.apple.id,
            'Apple Watch SE',
            'apple-watch-se',
            'Доступные умные часы с основными функциями.',
            149990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Размер', values: ['40mm', '44mm'] }],
          ),

          // AirPods - 40 products
          ...generateProducts(
            airpods.id,
            brands.apple.id,
            'AirPods Pro 2',
            'airpods-pro-2',
            'Наушники с активным шумоподавлением и USB-C.',
            129990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Шумоподавление', values: ['Активное'] },
              { name: 'Разъём', values: ['USB-C'] },
            ],
          ),
          ...generateProducts(
            airpods.id,
            brands.apple.id,
            'AirPods Max',
            'airpods-max',
            'Накладные наушники премиум-класса с Hi-Fi звуком.',
            299990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Тип', values: ['Накладные'] },
              { name: 'Материал', values: ['Алюминий'] },
            ],
          ),
          ...generateProducts(
            airpods.id,
            brands.apple.id,
            'AirPods 3',
            'airpods-3',
            'Беспроводные наушники с пространственным звуком.',
            99990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Тип', values: ['Вкладыши'] }],
          ),

          // iMac - 40 products
          ...generateProducts(
            imac.id,
            brands.apple.id,
            'iMac 24" M3',
            'imac-24-m3',
            'Моноблок с чипом M3 и ярким дисплеем Retina 4.5K.',
            749990,
            PRODUCT_IMAGES,
            20,
            [
              { name: 'Чип', values: ['M3'] },
              { name: 'Диагональ', values: ['24"'] },
              { name: 'RAM', values: ['8GB', '16GB', '24GB'] },
            ],
          ),
          ...generateProducts(
            imac.id,
            brands.apple.id,
            'iMac 24" M1',
            'imac-24-m1',
            'Моноблок с чипом M1 и великолепным дизайном.',
            599990,
            PRODUCT_IMAGES,
            20,
            [
              { name: 'Чип', values: ['M1'] },
              { name: 'RAM', values: ['8GB', '16GB'] },
            ],
          ),

          // iPad - 40 products
          ...generateProducts(
            ipad.id,
            brands.apple.id,
            'iPad Pro 12.9" M2',
            'ipad-pro-12-9-m2',
            'Профессиональный планшет с чипом M2 и дисплеем Liquid Retina XDR.',
            599990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Чип', values: ['M2'] },
              { name: 'Диагональ', values: ['12.9"'] },
            ],
          ),
          ...generateProducts(
            ipad.id,
            brands.apple.id,
            'iPad Pro 11" M2',
            'ipad-pro-11-m2',
            'Компактный профессиональный планшет с чипом M2.',
            449990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Чип', values: ['M2'] },
              { name: 'Диагональ', values: ['11"'] },
            ],
          ),
          ...generateProducts(
            ipad.id,
            brands.apple.id,
            'iPad Air',
            'ipad-air',
            'Тонкий и мощный планшет с чипом M1.',
            349990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Чип', values: ['M1'] },
              { name: 'Диагональ', values: ['10.9"'] },
            ],
          ),
          ...generateProducts(
            ipad.id,
            brands.apple.id,
            'iPad 10',
            'ipad-10',
            'Доступный планшет с современным дизайном.',
            249990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Чип', values: ['A14 Bionic'] },
              { name: 'Диагональ', values: ['10.9"'] },
            ],
          ),

          // MacBook - 40 products
          ...generateProducts(
            macbook.id,
            brands.apple.id,
            'MacBook Pro 16" M3 Max',
            'macbook-pro-16-m3-max',
            'Самый мощный ноутбук Apple с чипом M3 Max.',
            1999990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Чип', values: ['M3 Max'] },
              { name: 'Диагональ', values: ['16"'] },
              {
                name: 'RAM',
                values: ['36GB', '48GB', '64GB', '96GB', '128GB'],
              },
            ],
          ),
          ...generateProducts(
            macbook.id,
            brands.apple.id,
            'MacBook Pro 14" M3 Pro',
            'macbook-pro-14-m3-pro',
            'Профессиональный ноутбук с чипом M3 Pro.',
            1099990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Чип', values: ['M3 Pro'] },
              { name: 'Диагональ', values: ['14"'] },
              { name: 'RAM', values: ['18GB', '36GB'] },
            ],
          ),
          ...generateProducts(
            macbook.id,
            brands.apple.id,
            'MacBook Air 15" M3',
            'macbook-air-15-m3',
            'Тонкий и лёгкий ноутбук с большим экраном.',
            749990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Чип', values: ['M3'] },
              { name: 'Диагональ', values: ['15.3"'] },
            ],
          ),
          ...generateProducts(
            macbook.id,
            brands.apple.id,
            'MacBook Air 13" M3',
            'macbook-air-13-m3',
            'Компактный и мощный ноутбук для повседневных задач.',
            599990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Чип', values: ['M3'] },
              { name: 'Диагональ', values: ['13.6"'] },
            ],
          ),

          // Mac mini - 40 products
          ...generateProducts(
            macMini.id,
            brands.apple.id,
            'Mac mini M2 Pro',
            'mac-mini-m2-pro',
            'Компактный десктоп с профессиональной производительностью.',
            699990,
            PRODUCT_IMAGES,
            20,
            [
              { name: 'Чип', values: ['M2 Pro'] },
              { name: 'RAM', values: ['16GB', '32GB'] },
              { name: 'SSD', values: ['512GB', '1TB', '2TB'] },
            ],
          ),
          ...generateProducts(
            macMini.id,
            brands.apple.id,
            'Mac mini M2',
            'mac-mini-m2',
            'Доступный и мощный компактный компьютер.',
            349990,
            PRODUCT_IMAGES,
            20,
            [
              { name: 'Чип', values: ['M2'] },
              { name: 'RAM', values: ['8GB', '16GB', '24GB'] },
            ],
          ),

          // ==================== SAMSUNG PRODUCTS ====================
          // Samsung Galaxy phones - 40 products
          ...generateProducts(
            samsungPhones.id,
            brands.samsung.id,
            'Samsung Galaxy S24 Ultra',
            'samsung-galaxy-s24-ultra',
            'Флагман с AI-функциями, S Pen и 200МП камерой.',
            649990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Камера', values: ['200MP'] },
              { name: 'S Pen', values: ['В комплекте'] },
              { name: 'Диагональ', values: ['6.8"'] },
            ],
          ),
          ...generateProducts(
            samsungPhones.id,
            brands.samsung.id,
            'Samsung Galaxy S24+',
            'samsung-galaxy-s24-plus',
            'Большой экран, мощный процессор и AI возможности.',
            499990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Диагональ', values: ['6.7"'] },
              { name: 'Камера', values: ['50MP'] },
            ],
          ),
          ...generateProducts(
            samsungPhones.id,
            brands.samsung.id,
            'Samsung Galaxy S24',
            'samsung-galaxy-s24',
            'Компактный флагман с передовыми AI функциями.',
            399990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Диагональ', values: ['6.2"'] }],
          ),
          ...generateProducts(
            samsungPhones.id,
            brands.samsung.id,
            'Samsung Galaxy Z Fold5',
            'samsung-galaxy-z-fold5',
            'Инновационный складной смартфон с большим экраном.',
            799990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Тип', values: ['Складной'] },
              { name: 'Диагональ', values: ['7.6"'] },
            ],
          ),

          // Samsung Watch - 40 products
          ...generateProducts(
            samsungWatch.id,
            brands.samsung.id,
            'Samsung Galaxy Watch 6 Classic',
            'samsung-galaxy-watch-6-classic',
            'Премиальные смарт-часы с вращающимся безелем.',
            199990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Размер', values: ['43mm', '47mm'] },
              { name: 'Безель', values: ['Вращающийся'] },
            ],
          ),
          ...generateProducts(
            samsungWatch.id,
            brands.samsung.id,
            'Samsung Galaxy Watch 6',
            'samsung-galaxy-watch-6',
            'Стильные смарт-часы с продвинутыми функциями здоровья.',
            149990,
            PRODUCT_IMAGES,
            15,
            [{ name: 'Размер', values: ['40mm', '44mm'] }],
          ),
          ...generateProducts(
            samsungWatch.id,
            brands.samsung.id,
            'Samsung Galaxy Watch FE',
            'samsung-galaxy-watch-fe',
            'Доступные смарт-часы с основными функциями.',
            99990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Размер', values: ['40mm'] }],
          ),

          // Galaxy Buds - 40 products
          ...generateProducts(
            galaxyBuds.id,
            brands.samsung.id,
            'Samsung Galaxy Buds3 Pro',
            'samsung-galaxy-buds3-pro',
            'Премиальные наушники с продвинутым шумоподавлением.',
            119990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Шумоподавление', values: ['Активное'] },
              { name: 'Аудио', values: ['360 Audio'] },
            ],
          ),
          ...generateProducts(
            galaxyBuds.id,
            brands.samsung.id,
            'Samsung Galaxy Buds3',
            'samsung-galaxy-buds3',
            'Беспроводные наушники с отличным звуком.',
            79990,
            PRODUCT_IMAGES,
            15,
            [{ name: 'Шумоподавление', values: ['Пассивное'] }],
          ),
          ...generateProducts(
            galaxyBuds.id,
            brands.samsung.id,
            'Samsung Galaxy Buds FE',
            'samsung-galaxy-buds-fe',
            'Доступные наушники с хорошим звуком.',
            49990,
            PRODUCT_IMAGES,
            10,
            [],
          ),

          // Samsung Tablets - 40 products
          ...generateProducts(
            samsungTablets.id,
            brands.samsung.id,
            'Samsung Galaxy Tab S9 Ultra',
            'samsung-galaxy-tab-s9-ultra',
            'Большой планшет с AMOLED экраном и S Pen в комплекте.',
            549990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Диагональ', values: ['14.6"'] },
              { name: 'S Pen', values: ['В комплекте'] },
            ],
          ),
          ...generateProducts(
            samsungTablets.id,
            brands.samsung.id,
            'Samsung Galaxy Tab S9+',
            'samsung-galaxy-tab-s9-plus',
            'Производительный планшет для работы и развлечений.',
            449990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Диагональ', values: ['12.4"'] }],
          ),
          ...generateProducts(
            samsungTablets.id,
            brands.samsung.id,
            'Samsung Galaxy Tab S9',
            'samsung-galaxy-tab-s9',
            'Компактный планшет с отличным экраном.',
            349990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Диагональ', values: ['11"'] }],
          ),
          ...generateProducts(
            samsungTablets.id,
            brands.samsung.id,
            'Samsung Galaxy Tab A9+',
            'samsung-galaxy-tab-a9-plus',
            'Доступный планшет для всей семьи.',
            149990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Диагональ', values: ['11"'] }],
          ),

          // ==================== XIAOMI PRODUCTS ====================
          // Xiaomi Phones - 40 products
          ...generateProducts(
            xiaomiPhones.id,
            brands.xiaomi.id,
            'Xiaomi 14 Ultra',
            'xiaomi-14-ultra',
            'Флагман с камерой Leica и Snapdragon 8 Gen 3.',
            549990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Камера', values: ['Leica'] },
              { name: 'Процессор', values: ['Snapdragon 8 Gen 3'] },
            ],
          ),
          ...generateProducts(
            xiaomiPhones.id,
            brands.xiaomi.id,
            'Xiaomi 14',
            'xiaomi-14',
            'Компактный флагман с камерой Leica.',
            399990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Камера', values: ['Leica'] },
              { name: 'Диагональ', values: ['6.36"'] },
            ],
          ),
          ...generateProducts(
            xiaomiPhones.id,
            brands.xiaomi.id,
            'Redmi Note 13 Pro+',
            'redmi-note-13-pro-plus',
            'Отличное соотношение цена/качество с 200МП камерой.',
            199990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Камера', values: ['200MP'] }],
          ),
          ...generateProducts(
            xiaomiPhones.id,
            brands.xiaomi.id,
            'Redmi Note 13 Pro',
            'redmi-note-13-pro',
            'Мощный смартфон среднего класса.',
            149990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Камера', values: ['200MP'] }],
          ),

          // Xiaomi Watch - 40 products
          ...generateProducts(
            xiaomiWatch.id,
            brands.xiaomi.id,
            'Xiaomi Watch 2 Pro',
            'xiaomi-watch-2-pro',
            'Премиальные смарт-часы с Wear OS.',
            149990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'ОС', values: ['Wear OS'] },
              { name: 'GPS', values: ['Да'] },
            ],
          ),
          ...generateProducts(
            xiaomiWatch.id,
            brands.xiaomi.id,
            'Xiaomi Watch S3',
            'xiaomi-watch-s3',
            'Стильные смарт-часы со сменными безелями.',
            99990,
            PRODUCT_IMAGES,
            15,
            [{ name: 'Безель', values: ['Сменный'] }],
          ),
          ...generateProducts(
            xiaomiWatch.id,
            brands.xiaomi.id,
            'Xiaomi Smart Band 8',
            'xiaomi-smart-band-8',
            'Доступный фитнес-браслет с AMOLED экраном.',
            29990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Тип', values: ['Фитнес-браслет'] }],
          ),

          // Xiaomi Buds - 40 products
          ...generateProducts(
            xiaomiBuds.id,
            brands.xiaomi.id,
            'Xiaomi Buds 4 Pro',
            'xiaomi-buds-4-pro',
            'Премиальные наушники с отличным шумоподавлением.',
            89990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Шумоподавление', values: ['Активное'] },
              { name: 'Кодек', values: ['LDAC'] },
            ],
          ),
          ...generateProducts(
            xiaomiBuds.id,
            brands.xiaomi.id,
            'Xiaomi Buds 4',
            'xiaomi-buds-4',
            'Беспроводные наушники с хорошим звуком.',
            49990,
            PRODUCT_IMAGES,
            15,
            [],
          ),
          ...generateProducts(
            xiaomiBuds.id,
            brands.xiaomi.id,
            'Redmi Buds 5 Pro',
            'redmi-buds-5-pro',
            'Доступные наушники с шумоподавлением.',
            39990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Шумоподавление', values: ['Активное'] }],
          ),

          // ==================== DYSON PRODUCTS ====================
          // Dyson Vacuums - 40 products
          ...generateProducts(
            dysonVacuums.id,
            brands.dyson.id,
            'Dyson V15 Detect Absolute',
            'dyson-v15-detect-absolute',
            'Беспроводной пылесос с лазерной подсветкой пыли.',
            449990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Тип', values: ['Беспроводной'] },
              { name: 'Мощность', values: ['230AW'] },
              { name: 'Лазер', values: ['Да'] },
            ],
          ),
          ...generateProducts(
            dysonVacuums.id,
            brands.dyson.id,
            'Dyson V12 Detect Slim',
            'dyson-v12-detect-slim',
            'Лёгкий беспроводной пылесос с лазером.',
            349990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Тип', values: ['Беспроводной'] },
              { name: 'Мощность', values: ['150AW'] },
            ],
          ),
          ...generateProducts(
            dysonVacuums.id,
            brands.dyson.id,
            'Dyson V8 Origin',
            'dyson-v8-origin',
            'Надёжный беспроводной пылесос.',
            199990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Тип', values: ['Беспроводной'] },
              { name: 'Мощность', values: ['115AW'] },
            ],
          ),

          // Dyson Aircare - 40 products
          ...generateProducts(
            dysonAircare.id,
            brands.dyson.id,
            'Dyson Purifier Hot+Cool',
            'dyson-purifier-hot-cool',
            'Очиститель воздуха с функцией обогрева и охлаждения.',
            399990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Функции', values: ['Очистка', 'Обогрев', 'Охлаждение'] },
              { name: 'HEPA', values: ['H13'] },
            ],
          ),
          ...generateProducts(
            dysonAircare.id,
            brands.dyson.id,
            'Dyson Purifier Cool',
            'dyson-purifier-cool',
            'Очиститель воздуха с вентилятором.',
            299990,
            PRODUCT_IMAGES,
            15,
            [{ name: 'Функции', values: ['Очистка', 'Охлаждение'] }],
          ),
          ...generateProducts(
            dysonAircare.id,
            brands.dyson.id,
            'Dyson Humidify+Cool',
            'dyson-humidify-cool',
            'Увлажнитель с функцией очистки воздуха.',
            349990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Функции', values: ['Увлажнение', 'Охлаждение'] }],
          ),

          // Dyson Haircare - 40 products
          ...generateProducts(
            dysonHaircare.id,
            brands.dyson.id,
            'Dyson Airwrap Complete Long',
            'dyson-airwrap-complete-long',
            'Стайлер для длинных волос с эффектом Коанда.',
            299990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Насадки', values: ['6 шт', '8 шт'] },
              { name: 'Для волос', values: ['Длинные'] },
            ],
          ),
          ...generateProducts(
            dysonHaircare.id,
            brands.dyson.id,
            'Dyson Supersonic',
            'dyson-supersonic',
            'Профессиональный фен с интеллектуальным контролем температуры.',
            249990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Мощность', values: ['1600W'] },
              { name: 'Насадки', values: ['5 шт'] },
            ],
          ),
          ...generateProducts(
            dysonHaircare.id,
            brands.dyson.id,
            'Dyson Corrale',
            'dyson-corrale',
            'Беспроводной выпрямитель с гибкими пластинами.',
            249990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Тип', values: ['Беспроводной'] },
              { name: 'Пластины', values: ['Гибкие'] },
            ],
          ),

          // ==================== OTHER CATEGORIES ====================
          // Smartphones (general) - 40 products
          ...generateProducts(
            smartphones.id,
            brands.google.id,
            'Google Pixel 8 Pro',
            'google-pixel-8-pro',
            'Флагман Google с лучшей камерой и AI функциями.',
            499990,
            PRODUCT_IMAGES,
            20,
            [
              { name: 'Камера', values: ['50MP'] },
              { name: 'AI', values: ['Gemini'] },
            ],
          ),
          ...generateProducts(
            smartphones.id,
            brands.huawei.id,
            'Huawei Mate 60 Pro',
            'huawei-mate-60-pro',
            'Флагман Huawei с передовыми технологиями.',
            599990,
            PRODUCT_IMAGES,
            20,
            [{ name: 'Камера', values: ['48MP'] }],
          ),

          // Laptops (general) - 40 products
          ...generateProducts(
            laptops.id,
            brands.huawei.id,
            'Huawei MateBook X Pro',
            'huawei-matebook-x-pro',
            'Премиальный ультрабук с OLED экраном.',
            799990,
            PRODUCT_IMAGES,
            20,
            [
              { name: 'Диагональ', values: ['14.2"'] },
              { name: 'Дисплей', values: ['OLED'] },
            ],
          ),
          ...generateProducts(
            laptops.id,
            brands.huawei.id,
            'Huawei MateBook 14',
            'huawei-matebook-14',
            'Тонкий ноутбук для работы и учёбы.',
            499990,
            PRODUCT_IMAGES,
            20,
            [{ name: 'Диагональ', values: ['14"'] }],
          ),

          // Smart Watches (general) - 40 products
          ...generateProducts(
            watches.id,
            brands.huawei.id,
            'Huawei Watch GT 4',
            'huawei-watch-gt-4',
            'Стильные смарт-часы с долгим временем работы.',
            129990,
            PRODUCT_IMAGES,
            20,
            [
              { name: 'Автономность', values: ['14 дней'] },
              { name: 'GPS', values: ['Да'] },
            ],
          ),
          ...generateProducts(
            watches.id,
            brands.google.id,
            'Google Pixel Watch 2',
            'google-pixel-watch-2',
            'Умные часы с Wear OS и интеграцией Fitbit.',
            179990,
            PRODUCT_IMAGES,
            20,
            [
              { name: 'ОС', values: ['Wear OS'] },
              { name: 'Fitbit', values: ['Да'] },
            ],
          ),

          // Headphones (general) - 40 products
          ...generateProducts(
            headphones.id,
            brands.sony.id,
            'Sony WH-1000XM5',
            'sony-wh-1000xm5',
            'Лучшие наушники с шумоподавлением в мире.',
            199990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Тип', values: ['Накладные'] },
              { name: 'Шумоподавление', values: ['Активное'] },
            ],
          ),
          ...generateProducts(
            headphones.id,
            brands.sony.id,
            'Sony WF-1000XM5',
            'sony-wf-1000xm5',
            'Компактные TWS наушники с превосходным звуком.',
            149990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'Тип', values: ['TWS'] },
              { name: 'Шумоподавление', values: ['Активное'] },
            ],
          ),
          ...generateProducts(
            headphones.id,
            brands.jbl.id,
            'JBL Tour One M2',
            'jbl-tour-one-m2',
            'Накладные наушники с мощным басом.',
            149990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Тип', values: ['Накладные'] },
              { name: 'Бас', values: ['JBL Pro Sound'] },
            ],
          ),

          // Gaming Consoles - 40 products
          ...generateProducts(
            gamingConsoles.id,
            brands.sony.id,
            'PlayStation 5',
            'playstation-5',
            'Игровая консоль нового поколения с ray tracing.',
            349990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'SSD', values: ['825GB'] },
              { name: 'Разрешение', values: ['4K'] },
            ],
          ),
          ...generateProducts(
            gamingConsoles.id,
            brands.sony.id,
            'PlayStation 5 Slim',
            'playstation-5-slim',
            'Компактная версия PlayStation 5.',
            329990,
            PRODUCT_IMAGES,
            15,
            [
              { name: 'SSD', values: ['1TB'] },
              { name: 'Тип', values: ['Slim'] },
            ],
          ),
          ...generateProducts(
            gamingConsoles.id,
            brands.sony.id,
            'PlayStation 5 Digital',
            'playstation-5-digital',
            'Цифровая версия PS5 без дисковода.',
            299990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Тип', values: ['Digital'] }],
          ),

          // Accessories - 40 products
          ...generateProducts(
            accessories.id,
            brands.apple.id,
            'Apple MagSafe Charger',
            'apple-magsafe-charger',
            'Беспроводное зарядное устройство с магнитным креплением.',
            24990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Мощность', values: ['15W'] }],
          ),
          ...generateProducts(
            accessories.id,
            brands.apple.id,
            'Apple Leather Case iPhone 15 Pro',
            'apple-leather-case-iphone-15-pro',
            'Кожаный чехол с MagSafe для iPhone 15 Pro.',
            34990,
            PRODUCT_IMAGES,
            10,
            [
              { name: 'Материал', values: ['Кожа'] },
              { name: 'MagSafe', values: ['Да'] },
            ],
          ),
          ...generateProducts(
            accessories.id,
            brands.samsung.id,
            'Samsung 45W Power Adapter',
            'samsung-45w-power-adapter',
            'Быстрое зарядное устройство для Samsung устройств.',
            14990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'Мощность', values: ['45W'] }],
          ),
          ...generateProducts(
            accessories.id,
            brands.apple.id,
            'Apple AirTag',
            'apple-airtag',
            'Трекер для поиска вещей.',
            14990,
            PRODUCT_IMAGES,
            10,
            [{ name: 'В комплекте', values: ['1 шт', '4 шт'] }],
          ),
          */
        ];

  for (const productData of productsData) {
    const { images, attributes, categoryIds, ...data } = productData;

    const product = await prisma.product.create({
      data: {
        ...data,
        categories: {
          create: (categoryIds as string[]).map(
            (catId: string, idx: number) => ({
              categoryId: catId,
              isPrimary: idx === 0, // First category is primary
            }),
          ),
        },
        images: {
          create: images.map(
            (img: { url: string; alt: string }, idx: number) => ({
              url: img.url,
              alt: img.alt,
              sortOrder: idx,
            }),
          ),
        },
        attributes: attributes
          ? {
              create: attributes.map(
                (attr: { name: string; value: string }) => ({
                  name: attr.name,
                  value: attr.value,
                }),
              ),
            }
          : undefined,
      },
    });

    // Add stock to pickup points
    if (pickupPoint) {
      await prisma.productStock.createMany({
        data: [
          {
            productId: product.id,
            pointId: pickupPoint.id,
            sku: `SKU-${product.slug}-1`,
            stockCount: Math.floor(Math.random() * 50) + 5,
          },
        ],
      });
    }
  }

  // Create some reviews
  console.log('⭐ Creating reviews...');
  const products = await prisma.product.findMany({ take: 50 });
  for (const product of products) {
    const ratings = [4, 5, 5, 4, 5];
    for (const rating of ratings.slice(0, Math.floor(Math.random() * 3) + 2)) {
      await prisma.review
        .create({
          data: {
            productId: product.id,
            userId: testUser.id,
            rating,
            comment:
              rating === 5
                ? 'Отличный товар! Рекомендую!'
                : 'Хороший товар, качество соответствует цене.',
          },
        })
        .catch(() => {}); // Skip if duplicate
    }
  }

  // Create coupons
  console.log('🎟️ Creating coupons...');
  const couponsData = [
    {
      code: 'WELCOME10',
      type: 'PERCENTAGE' as const,
      value: 10,
      validFrom: new Date(),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      usageLimit: 1000,
    },
    {
      code: 'SAVE5000',
      type: 'FIXED' as const,
      value: 5000,
      validFrom: new Date(),
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      usageLimit: 500,
    },
  ];

  for (const coupon of couponsData) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: coupon,
      create: coupon,
    });
  }

  console.log('📊 Seed summary:');
  console.log(`   - Users: ${await prisma.user.count()}`);
  console.log(`   - Brands: ${await prisma.brand.count()}`);
  console.log(`   - Categories: ${await prisma.category.count()}`);
  console.log(`   - Products: ${await prisma.product.count()}`);
  console.log(`   - Pickup Points: ${await prisma.pickupPoint.count()}`);
  console.log(`   - Product Stock: ${await prisma.productStock.count()}`);
  console.log(`   - Reviews: ${await prisma.review.count()}`);
  console.log(`   - Coupons: ${await prisma.coupon.count()}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('\n✅ Seed completed successfully!');
  })
  .catch(async (e) => {
    console.error('\n❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
