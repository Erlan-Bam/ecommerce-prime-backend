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

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.productAttribute.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productStock.deleteMany();
  await prisma.review.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.pickupWindow.deleteMany();
  await prisma.pickupPoint.deleteMany();
  await prisma.bonus.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.user.deleteMany();

  // Create admin user
  console.log('👤 Creating admin user...');
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@ecommerce.com',
      phone: '+77001234567',
      password: hashedPassword,
      name: 'Admin User',
      role: Role.ADMIN,
    },
  });

  // Create test user
  const testUser = await prisma.user.create({
    data: {
      email: 'user@ecommerce.com',
      phone: '+77007654321',
      password: await bcrypt.hash('user123', 10),
      name: 'Test User',
      role: Role.USER,
    },
  });

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
    brands[brand.slug] = await prisma.brand.create({ data: brand });
  }

  // Create Categories
  console.log('📁 Creating categories...');

  // Parent categories
  const smartphones = await prisma.category.create({
    data: {
      title: 'Смартфоны',
      slug: 'smartphones',
      image: '/images/categories/smartphones.png',
      sortOrder: 1,
    },
  });

  const tablets = await prisma.category.create({
    data: {
      title: 'Планшеты',
      slug: 'tablets',
      image: '/images/categories/tablets.png',
      sortOrder: 2,
    },
  });

  const laptops = await prisma.category.create({
    data: {
      title: 'Ноутбуки',
      slug: 'laptops',
      image: '/images/categories/laptops.png',
      sortOrder: 3,
    },
  });

  const watches = await prisma.category.create({
    data: {
      title: 'Умные часы',
      slug: 'smart-watches',
      image: '/images/categories/watches.png',
      sortOrder: 4,
    },
  });

  const headphones = await prisma.category.create({
    data: {
      title: 'Наушники',
      slug: 'headphones',
      image: '/images/categories/headphones.png',
      sortOrder: 5,
    },
  });

  const accessories = await prisma.category.create({
    data: {
      title: 'Аксессуары',
      slug: 'accessories',
      image: '/images/categories/accessories.png',
      sortOrder: 6,
    },
  });

  const homeAppliances = await prisma.category.create({
    data: {
      title: 'Бытовая техника',
      slug: 'home-appliances',
      image: '/images/categories/home-appliances.png',
      sortOrder: 7,
    },
  });

  // Subcategories for Smartphones
  const iphoneCategory = await prisma.category.create({
    data: {
      title: 'iPhone',
      slug: 'iphone',
      parentId: smartphones.id,
      image: '/images/categories/iphone.png',
      sortOrder: 1,
    },
  });

  const samsungPhones = await prisma.category.create({
    data: {
      title: 'Samsung Galaxy',
      slug: 'samsung-galaxy',
      parentId: smartphones.id,
      image: '/images/categories/samsung-phones.png',
      sortOrder: 2,
    },
  });

  const xiaomiPhones = await prisma.category.create({
    data: {
      title: 'Xiaomi',
      slug: 'xiaomi-phones',
      parentId: smartphones.id,
      image: '/images/categories/xiaomi-phones.png',
      sortOrder: 3,
    },
  });

  // Subcategories for Watches
  const appleWatch = await prisma.category.create({
    data: {
      title: 'Apple Watch',
      slug: 'apple-watch',
      parentId: watches.id,
      image: '/images/categories/apple-watch.png',
      sortOrder: 1,
    },
  });

  const samsungWatch = await prisma.category.create({
    data: {
      title: 'Samsung Galaxy Watch',
      slug: 'samsung-watch',
      parentId: watches.id,
      image: '/images/categories/samsung-watch.png',
      sortOrder: 2,
    },
  });

  // Subcategories for Headphones
  const airpods = await prisma.category.create({
    data: {
      title: 'AirPods',
      slug: 'airpods',
      parentId: headphones.id,
      image: '/images/categories/airpods.png',
      sortOrder: 1,
    },
  });

  const galaxyBuds = await prisma.category.create({
    data: {
      title: 'Galaxy Buds',
      slug: 'galaxy-buds',
      parentId: headphones.id,
      image: '/images/categories/galaxy-buds.png',
      sortOrder: 2,
    },
  });

  // Create Pickup Points
  console.log('📍 Creating pickup points...');
  const pickupPoint1 = await prisma.pickupPoint.create({
    data: {
      address: 'ул. Абая 150, ТРЦ Мега, Алматы',
      coords: '43.2380,76.9450',
      workingSchedule: {
        Пн: { from: '10:00', to: '22:00' },
        Вт: { from: '10:00', to: '22:00' },
        Ср: { from: '10:00', to: '22:00' },
        Чт: { from: '10:00', to: '22:00' },
        Пт: { from: '10:00', to: '22:00' },
        Сб: { from: '10:00', to: '22:00' },
        Вс: { from: '10:00', to: '21:00' },
      },
    },
  });

  const pickupPoint2 = await prisma.pickupPoint.create({
    data: {
      address: 'пр. Достык 5, ТЦ Керуен, Астана',
      coords: '51.1280,71.4300',
      workingSchedule: {
        Пн: { from: '09:00', to: '21:00' },
        Вт: { from: '09:00', to: '21:00' },
        Ср: { from: '09:00', to: '21:00' },
        Чт: { from: '09:00', to: '21:00' },
        Пт: { from: '09:00', to: '21:00' },
        Сб: { from: '10:00', to: '20:00' },
        Вс: { from: '10:00', to: '20:00' },
      },
    },
  });

  // Create Products
  console.log('📦 Creating products...');

  const productsData = [
    // iPhones
    {
      categoryId: iphoneCategory.id,
      brandId: brands.apple.id,
      name: 'iPhone 15 Pro Max 256GB',
      slug: 'iphone-15-pro-max-256gb',
      description:
        'Самый мощный iPhone с чипом A17 Pro, титановым корпусом и продвинутой камерой.',
      price: 699990,
      oldPrice: 749990,
      isOnSale: true,
      images: [
        {
          url: '/images/products/iphone-15-pro-max-1.png',
          alt: 'iPhone 15 Pro Max',
        },
        {
          url: '/images/products/iphone-15-pro-max-2.png',
          alt: 'iPhone 15 Pro Max сбоку',
        },
      ],
      attributes: [
        { name: 'Память', value: '256GB' },
        { name: 'Цвет', value: 'Natural Titanium' },
        { name: 'Диагональ', value: '6.7"' },
        { name: 'Процессор', value: 'A17 Pro' },
      ],
    },
    {
      categoryId: iphoneCategory.id,
      brandId: brands.apple.id,
      name: 'iPhone 15 Pro 128GB',
      slug: 'iphone-15-pro-128gb',
      description: 'Титановый дизайн, чип A17 Pro и система камер Pro.',
      price: 549990,
      images: [
        { url: '/images/products/iphone-15-pro-1.png', alt: 'iPhone 15 Pro' },
      ],
      attributes: [
        { name: 'Память', value: '128GB' },
        { name: 'Цвет', value: 'Black Titanium' },
        { name: 'Диагональ', value: '6.1"' },
      ],
    },
    {
      categoryId: iphoneCategory.id,
      brandId: brands.apple.id,
      name: 'iPhone 15 256GB',
      slug: 'iphone-15-256gb',
      description: 'Dynamic Island, 48-мегапиксельная камера и USB-C.',
      price: 449990,
      images: [{ url: '/images/products/iphone-15-1.png', alt: 'iPhone 15' }],
      attributes: [
        { name: 'Память', value: '256GB' },
        { name: 'Цвет', value: 'Blue' },
      ],
    },
    {
      categoryId: iphoneCategory.id,
      brandId: brands.apple.id,
      name: 'iPhone 14 128GB',
      slug: 'iphone-14-128gb',
      description: 'Отличный смартфон с чипом A15 Bionic.',
      price: 349990,
      oldPrice: 399990,
      isOnSale: true,
      images: [{ url: '/images/products/iphone-14-1.png', alt: 'iPhone 14' }],
      attributes: [
        { name: 'Память', value: '128GB' },
        { name: 'Цвет', value: 'Midnight' },
      ],
    },
    // Samsung Phones
    {
      categoryId: samsungPhones.id,
      brandId: brands.samsung.id,
      name: 'Samsung Galaxy S24 Ultra 512GB',
      slug: 'samsung-galaxy-s24-ultra-512gb',
      description: 'Флагман с AI-функциями, S Pen и 200МП камерой.',
      price: 649990,
      images: [
        {
          url: '/images/products/galaxy-s24-ultra-1.png',
          alt: 'Galaxy S24 Ultra',
        },
      ],
      attributes: [
        { name: 'Память', value: '512GB' },
        { name: 'Цвет', value: 'Titanium Black' },
        { name: 'Диагональ', value: '6.8"' },
      ],
    },
    {
      categoryId: samsungPhones.id,
      brandId: brands.samsung.id,
      name: 'Samsung Galaxy S24+ 256GB',
      slug: 'samsung-galaxy-s24-plus-256gb',
      description: 'Большой экран, мощный процессор и AI возможности.',
      price: 499990,
      images: [
        { url: '/images/products/galaxy-s24-plus-1.png', alt: 'Galaxy S24+' },
      ],
      attributes: [
        { name: 'Память', value: '256GB' },
        { name: 'Цвет', value: 'Violet' },
      ],
    },
    {
      categoryId: samsungPhones.id,
      brandId: brands.samsung.id,
      name: 'Samsung Galaxy Z Fold5 256GB',
      slug: 'samsung-galaxy-z-fold5-256gb',
      description: 'Инновационный складной смартфон с большим экраном.',
      price: 799990,
      isOnSale: true,
      oldPrice: 899990,
      images: [
        { url: '/images/products/galaxy-z-fold5-1.png', alt: 'Galaxy Z Fold5' },
      ],
      attributes: [
        { name: 'Память', value: '256GB' },
        { name: 'Тип', value: 'Складной' },
      ],
    },
    // Xiaomi Phones
    {
      categoryId: xiaomiPhones.id,
      brandId: brands.xiaomi.id,
      name: 'Xiaomi 14 Ultra 512GB',
      slug: 'xiaomi-14-ultra-512gb',
      description: 'Флагман с камерой Leica и Snapdragon 8 Gen 3.',
      price: 549990,
      images: [
        {
          url: '/images/products/xiaomi-14-ultra-1.png',
          alt: 'Xiaomi 14 Ultra',
        },
      ],
      attributes: [
        { name: 'Память', value: '512GB' },
        { name: 'Камера', value: 'Leica' },
      ],
    },
    {
      categoryId: xiaomiPhones.id,
      brandId: brands.xiaomi.id,
      name: 'Xiaomi 14 256GB',
      slug: 'xiaomi-14-256gb',
      description: 'Компактный флагман с камерой Leica.',
      price: 399990,
      images: [{ url: '/images/products/xiaomi-14-1.png', alt: 'Xiaomi 14' }],
      attributes: [{ name: 'Память', value: '256GB' }],
    },
    {
      categoryId: xiaomiPhones.id,
      brandId: brands.xiaomi.id,
      name: 'Redmi Note 13 Pro 256GB',
      slug: 'redmi-note-13-pro-256gb',
      description: 'Отличное соотношение цена/качество с 200МП камерой.',
      price: 149990,
      oldPrice: 179990,
      isOnSale: true,
      images: [
        {
          url: '/images/products/redmi-note-13-pro-1.png',
          alt: 'Redmi Note 13 Pro',
        },
      ],
      attributes: [
        { name: 'Память', value: '256GB' },
        { name: 'Камера', value: '200MP' },
      ],
    },
    // Apple Watch
    {
      categoryId: appleWatch.id,
      brandId: brands.apple.id,
      name: 'Apple Watch Ultra 2',
      slug: 'apple-watch-ultra-2',
      description: 'Самые прочные Apple Watch для экстремальных условий.',
      price: 399990,
      images: [
        {
          url: '/images/products/apple-watch-ultra-2-1.png',
          alt: 'Apple Watch Ultra 2',
        },
      ],
      attributes: [
        { name: 'Размер', value: '49mm' },
        { name: 'Материал', value: 'Титан' },
      ],
    },
    {
      categoryId: appleWatch.id,
      brandId: brands.apple.id,
      name: 'Apple Watch Series 9 45mm',
      slug: 'apple-watch-series-9-45mm',
      description: 'Умные часы с двойным касанием и ярким дисплеем.',
      price: 249990,
      images: [
        {
          url: '/images/products/apple-watch-s9-1.png',
          alt: 'Apple Watch Series 9',
        },
      ],
      attributes: [
        { name: 'Размер', value: '45mm' },
        { name: 'GPS', value: 'Да' },
      ],
    },
    // Samsung Watch
    {
      categoryId: samsungWatch.id,
      brandId: brands.samsung.id,
      name: 'Samsung Galaxy Watch 6 Classic 47mm',
      slug: 'samsung-galaxy-watch-6-classic-47mm',
      description: 'Премиальные смарт-часы с вращающимся безелем.',
      price: 199990,
      images: [
        {
          url: '/images/products/galaxy-watch-6-classic-1.png',
          alt: 'Galaxy Watch 6 Classic',
        },
      ],
      attributes: [
        { name: 'Размер', value: '47mm' },
        { name: 'Безель', value: 'Вращающийся' },
      ],
    },
    // AirPods
    {
      categoryId: airpods.id,
      brandId: brands.apple.id,
      name: 'AirPods Pro 2',
      slug: 'airpods-pro-2',
      description: 'Наушники с активным шумоподавлением и USB-C.',
      price: 129990,
      images: [
        { url: '/images/products/airpods-pro-2-1.png', alt: 'AirPods Pro 2' },
      ],
      attributes: [
        { name: 'Шумоподавление', value: 'Активное' },
        { name: 'Разъём', value: 'USB-C' },
      ],
    },
    {
      categoryId: airpods.id,
      brandId: brands.apple.id,
      name: 'AirPods Max',
      slug: 'airpods-max',
      description: 'Накладные наушники премиум-класса с Hi-Fi звуком.',
      price: 299990,
      oldPrice: 349990,
      isOnSale: true,
      images: [
        { url: '/images/products/airpods-max-1.png', alt: 'AirPods Max' },
      ],
      attributes: [
        { name: 'Тип', value: 'Накладные' },
        { name: 'Материал', value: 'Алюминий' },
      ],
    },
    // Galaxy Buds
    {
      categoryId: galaxyBuds.id,
      brandId: brands.samsung.id,
      name: 'Samsung Galaxy Buds2 Pro',
      slug: 'samsung-galaxy-buds2-pro',
      description: 'Беспроводные наушники с 360 Audio и шумоподавлением.',
      price: 99990,
      images: [
        {
          url: '/images/products/galaxy-buds2-pro-1.png',
          alt: 'Galaxy Buds2 Pro',
        },
      ],
      attributes: [{ name: 'Аудио', value: '360 Audio' }],
    },
    // Laptops
    {
      categoryId: laptops.id,
      brandId: brands.apple.id,
      name: 'MacBook Pro 14" M3 Pro',
      slug: 'macbook-pro-14-m3-pro',
      description: 'Профессиональный ноутбук с чипом M3 Pro.',
      price: 1099990,
      images: [
        { url: '/images/products/macbook-pro-14-1.png', alt: 'MacBook Pro 14' },
      ],
      attributes: [
        { name: 'Чип', value: 'M3 Pro' },
        { name: 'Память', value: '18GB' },
        { name: 'SSD', value: '512GB' },
      ],
    },
    {
      categoryId: laptops.id,
      brandId: brands.apple.id,
      name: 'MacBook Air 15" M3',
      slug: 'macbook-air-15-m3',
      description: 'Тонкий и лёгкий ноутбук с большим экраном.',
      price: 749990,
      images: [
        { url: '/images/products/macbook-air-15-1.png', alt: 'MacBook Air 15' },
      ],
      attributes: [
        { name: 'Чип', value: 'M3' },
        { name: 'Диагональ', value: '15.3"' },
      ],
    },
    // Home Appliances - Dyson
    {
      categoryId: homeAppliances.id,
      brandId: brands.dyson.id,
      name: 'Dyson V15 Detect Absolute',
      slug: 'dyson-v15-detect-absolute',
      description: 'Беспроводной пылесос с лазерной подсветкой пыли.',
      price: 449990,
      images: [{ url: '/images/products/dyson-v15-1.png', alt: 'Dyson V15' }],
      attributes: [
        { name: 'Тип', value: 'Беспроводной' },
        { name: 'Мощность', value: '230AW' },
      ],
    },
    {
      categoryId: homeAppliances.id,
      brandId: brands.dyson.id,
      name: 'Dyson Airwrap Complete',
      slug: 'dyson-airwrap-complete',
      description: 'Стайлер для волос с эффектом Коанда.',
      price: 299990,
      isOnSale: true,
      oldPrice: 349990,
      images: [
        { url: '/images/products/dyson-airwrap-1.png', alt: 'Dyson Airwrap' },
      ],
      attributes: [{ name: 'Насадки', value: '6 шт' }],
    },
    // Tablets
    {
      categoryId: tablets.id,
      brandId: brands.apple.id,
      name: 'iPad Pro 12.9" M2 256GB',
      slug: 'ipad-pro-12-9-m2-256gb',
      description:
        'Профессиональный планшет с чипом M2 и дисплеем Liquid Retina XDR.',
      price: 599990,
      images: [
        { url: '/images/products/ipad-pro-1.png', alt: 'iPad Pro 12.9' },
      ],
      attributes: [
        { name: 'Чип', value: 'M2' },
        { name: 'Память', value: '256GB' },
        { name: 'Дисплей', value: 'Liquid Retina XDR' },
      ],
    },
    {
      categoryId: tablets.id,
      brandId: brands.samsung.id,
      name: 'Samsung Galaxy Tab S9 Ultra',
      slug: 'samsung-galaxy-tab-s9-ultra',
      description: 'Большой планшет с AMOLED экраном и S Pen в комплекте.',
      price: 549990,
      images: [
        {
          url: '/images/products/galaxy-tab-s9-ultra-1.png',
          alt: 'Galaxy Tab S9 Ultra',
        },
      ],
      attributes: [
        { name: 'Диагональ', value: '14.6"' },
        { name: 'S Pen', value: 'В комплекте' },
      ],
    },
    // Accessories
    {
      categoryId: accessories.id,
      brandId: brands.apple.id,
      name: 'Apple MagSafe Charger',
      slug: 'apple-magsafe-charger',
      description: 'Беспроводное зарядное устройство с магнитным креплением.',
      price: 24990,
      images: [
        {
          url: '/images/products/magsafe-charger-1.png',
          alt: 'MagSafe Charger',
        },
      ],
      attributes: [{ name: 'Мощность', value: '15W' }],
    },
    {
      categoryId: accessories.id,
      brandId: brands.apple.id,
      name: 'Apple Leather Case для iPhone 15 Pro',
      slug: 'apple-leather-case-iphone-15-pro',
      description: 'Кожаный чехол с MagSafe для iPhone 15 Pro.',
      price: 34990,
      images: [
        { url: '/images/products/leather-case-1.png', alt: 'Leather Case' },
      ],
      attributes: [
        { name: 'Материал', value: 'Кожа' },
        { name: 'MagSafe', value: 'Да' },
      ],
    },
  ];

  for (const productData of productsData) {
    const { images, attributes, ...data } = productData;

    const product = await prisma.product.create({
      data: {
        ...data,
        images: {
          create: images.map((img, idx) => ({
            url: img.url,
            alt: img.alt,
            sortOrder: idx,
          })),
        },
        attributes: attributes
          ? {
              create: attributes.map((attr) => ({
                name: attr.name,
                value: attr.value,
              })),
            }
          : undefined,
      },
    });

    // Add stock to pickup points
    await prisma.productStock.createMany({
      data: [
        {
          productId: product.id,
          pointId: pickupPoint1.id,
          sku: `SKU-${product.slug}-1`,
          stockCount: Math.floor(Math.random() * 50) + 5,
        },
        {
          productId: product.id,
          pointId: pickupPoint2.id,
          sku: `SKU-${product.slug}-2`,
          stockCount: Math.floor(Math.random() * 30) + 3,
        },
      ],
    });
  }

  // Create some reviews
  console.log('⭐ Creating reviews...');
  const products = await prisma.product.findMany({ take: 10 });
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
  await prisma.coupon.createMany({
    data: [
      {
        code: 'WELCOME10',
        type: 'PERCENTAGE',
        value: 10,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        usageLimit: 1000,
      },
      {
        code: 'SAVE5000',
        type: 'FIXED',
        value: 5000,
        validFrom: new Date(),
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usageLimit: 500,
      },
    ],
  });

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
