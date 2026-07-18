import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../shared/services/prisma.service';
import { SearchCacheService } from './services/cache.service';

const mockPrisma = {
  product: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  category: {
    findMany: jest.fn(),
  },
  brand: {
    findMany: jest.fn(),
  },
};

const mockCacheService = {
  getCachedAutocomplete: jest.fn().mockResolvedValue(null),
  getCachedSearch: jest.fn().mockResolvedValue(null),
  cacheAutocomplete: jest.fn().mockResolvedValue(undefined),
  cacheSearch: jest.fn().mockResolvedValue(undefined),
};

const makeSearchProduct = (name: string, soldCount: number) => ({
  id: name,
  brandId: 'apple-brand',
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  description: '',
  price: 1000,
  oldPrice: null,
  isActive: true,
  isOnSale: false,
  isPopular: false,
  viewCount: 0,
  soldCount,
  isDeleted: false,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  categories: [
    {
      category: {
        id: 'ipad-category',
        title: 'Планшеты Apple iPad',
        slug: 'planshety-1',
      },
    },
  ],
  brand: { id: 'apple-brand', name: 'Apple', slug: 'apple' },
  images: [],
  reviews: [],
  productStock: [{ stockCount: 1 }],
});

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SearchCacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('ranks an iPad product above iPad accessories for search queries', async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      makeSearchProduct(
        'Клавиатура Magic Keyboard Folio for iPad (10th generation\\iPad 11th generation)',
        25,
      ),
      makeSearchProduct('Apple iPad 11 A16 128GB Wi-Fi Blue', 0),
    ]);
    mockPrisma.product.count.mockResolvedValue(2);

    const result = await service.search({ q: 'ipad 11', limit: 2 });

    expect(result.results.map((product) => product.name)).toEqual([
      'Apple iPad 11 A16 128GB Wi-Fi Blue',
      'Клавиатура Magic Keyboard Folio for iPad (10th generation\\iPad 11th generation)',
    ]);
  });

  it('keeps iPad devices above accessories when the model number is separated by product words', async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      makeSearchProduct(
        'Клавиатура Magic Keyboard Folio for iPad (10th generation\\iPad 11th generation)',
        0,
      ),
      makeSearchProduct('Apple iPad Pro 11" M5 Wi-Fi 256ГБ Серебристый', 0),
    ]);
    mockPrisma.product.count.mockResolvedValue(2);

    const result = await service.search({ q: 'ipad 11', limit: 2 });

    expect(result.results.map((product) => product.name)).toEqual([
      'Apple iPad Pro 11" M5 Wi-Fi 256ГБ Серебристый',
      'Клавиатура Magic Keyboard Folio for iPad (10th generation\\iPad 11th generation)',
    ]);
  });

  it('uses token fallback for multi-word search queries with punctuation in product names', async () => {
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.product.count.mockResolvedValue(0);

    await service.search({ q: 'ipad 11', limit: 5 });

    const where = mockPrisma.product.findMany.mock.calls[0][0].where;
    const serializedWhere = JSON.stringify(where);
    expect(serializedWhere).toContain('"AND"');
    expect(serializedWhere).toContain('"contains":"ipad"');
    expect(serializedWhere).toContain('"contains":"11"');
  });

  it('ranks an iPad product above iPad accessories for autocomplete queries', async () => {
    mockPrisma.product.findMany.mockResolvedValue([
      {
        id: 'keyboard',
        name: 'Клавиатура Magic Keyboard Folio for iPad (10th generation\\iPad 11th generation)',
        slug: 'magic-keyboard-ipad',
        price: 34990,
        images: [],
      },
      {
        id: 'ipad',
        name: 'Apple iPad 11 A16 128GB Wi-Fi Blue',
        slug: 'apple-ipad-11-a16',
        price: 49990,
        images: [],
      },
    ]);
    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.brand.findMany.mockResolvedValue([]);

    const result = await service.autocomplete({ q: 'ipad 11', limit: 2 });

    expect(result.suggestions.products.map((product) => product.name)).toEqual([
      'Apple iPad 11 A16 128GB Wi-Fi Blue',
      'Клавиатура Magic Keyboard Folio for iPad (10th generation\\iPad 11th generation)',
    ]);
  });

  it('uses token fallback for multi-word autocomplete queries', async () => {
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.brand.findMany.mockResolvedValue([]);

    await service.autocomplete({ q: 'ipad 11', limit: 5 });

    const where = mockPrisma.product.findMany.mock.calls[0][0].where;
    const serializedWhere = JSON.stringify(where);
    expect(serializedWhere).toContain('"AND"');
    expect(serializedWhere).toContain('"contains":"ipad"');
    expect(serializedWhere).toContain('"contains":"11"');
  });
});
