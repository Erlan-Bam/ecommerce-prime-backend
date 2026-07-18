import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { TextDecoder } from 'util';
import * as XLSX from 'xlsx';
import {
  inferNonAppleDeviceBrandFromProductName,
  isAccessoryLikeProduct,
  normalizeParsedCategoryPath,
} from '../src/shared/lib/catalog-classification';
import {
  extractTechnodeusProductPageAttributes,
  normalizeTechnodeusProductPageUrl,
} from '../src/shared/lib/technodeus-product-page';

const DEFAULT_SOURCE_URL = 'https://technodeus.ru/marketplace/76243.xml';
const DEFAULT_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'public',
  'products.xlsx',
);

const BASE_HEADERS = [
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
];

type ParsedCategory = {
  id: string;
  parentId: string | null;
  name: string;
};

type ParsedOfferParam = {
  name: string;
  value: string;
};

type ParsedOffer = {
  id: string;
  groupId: string | null;
  available: boolean;
  disabled: boolean;
  url: string;
  price: string;
  oldPrice: string;
  currencyId: string;
  categoryId: string;
  pictures: string[];
  name: string;
  vendorPath: string;
  vendorCode: string;
  description: string;
  params: ParsedOfferParam[];
};

type IncludedOffer = {
  offer: ParsedOffer;
  match: Extract<MatchResult, { include: true }>;
  pathItems: string[];
  leafSection: string;
  normalizedPath: ReturnType<typeof normalizeParsedCategoryPath>;
};

type MatchResult =
  | {
      include: true;
      brand: string;
      subcategory: string;
      reason: string;
    }
  | {
      include: false;
      reason: string;
    };

const SERVICE_EXCLUDE_TERMS = [
  'ремонт',
  'гравировк',
  'trade in',
  'трейд ин',
  'услуг',
  'установк',
  'настройк',
  'подарочн',
];

const ACCESSORY_TERMS = [
  'аксессуар',
  'чехол',
  'стекл',
  'пленк',
  'кабель',
  'адаптер',
  'заряд',
  'зарядк',
  'ремеш',
  'держател',
  'dock',
  'док станц',
  'переходник',
  'стилус',
  'stylus',
];

function readArg(name: string): string | undefined {
  const index = process.argv.findIndex(
    (value) => value === name || value.startsWith(`${name}=`),
  );
  if (index < 0) return undefined;

  const current = process.argv[index];
  if (current.startsWith(`${name}=`)) {
    return current.slice(name.length + 1).trim();
  }

  const next = process.argv[index + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next.trim();
}

function readPositiveIntArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeXmlEntities(input: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  };

  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    }

    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    }

    return entities[entity] ?? _;
  });
}

function cleanXmlText(input: string): string {
  return decodeXmlEntities(input)
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(input: string): string {
  return cleanXmlText(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttributes(rawAttrs: string): Record<string, string> {
  const result: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:][\w:.-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    result[match[1]] = cleanXmlText(match[2]);
  }

  return result;
}

function normalizeEncoding(raw?: string | null): string | null {
  if (!raw) return null;

  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, '');

  switch (normalized) {
    case 'utf8':
      return 'utf-8';
    case 'cp1251':
    case 'windows1251':
      return 'windows-1251';
    case 'koi8r':
      return 'koi8-r';
    default:
      return normalized || null;
  }
}

function detectEncodingFromContentType(
  contentType?: string | string[],
): string | null {
  const raw = Array.isArray(contentType) ? contentType.join(';') : contentType;
  if (!raw) return null;

  const match = raw.match(/charset=([^;]+)/i);
  return normalizeEncoding(match?.[1]);
}

function detectEncodingFromXmlDeclaration(buffer: Buffer): string | null {
  const head = buffer.subarray(0, 1024).toString('latin1');
  const match = head.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i);
  return normalizeEncoding(match?.[1]);
}

function tryDecodeBuffer(buffer: Buffer, encoding: string): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function decodeXmlBuffer(
  buffer: Buffer,
  contentType?: string | string[],
): string {
  const candidates = [
    detectEncodingFromContentType(contentType),
    detectEncodingFromXmlDeclaration(buffer),
    'utf-8',
    'windows-1251',
    'koi8-r',
  ].filter((value): value is string => Boolean(value));

  const uniqueCandidates = [...new Set(candidates)];
  let fallbackDecoded: string | null = null;

  for (const encoding of uniqueCandidates) {
    const decoded = tryDecodeBuffer(buffer, encoding);
    if (!decoded) continue;

    if (!decoded.includes('�')) {
      return decoded;
    }

    if (!fallbackDecoded) {
      fallbackDecoded = decoded;
    }
  }

  return fallbackDecoded ?? buffer.toString('utf8');
}

function fetchXml(
  url: string,
  timeoutMs = 120_000,
  redirectsLeft = 5,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;

    const request = client.get(
      url,
      {
        headers: {
          'User-Agent': 'prime-technodeus-parser/1.0',
          Accept: 'application/xml,text/xml,text/plain,*/*',
        },
      },
      (response) => {
        const statusCode = response.statusCode || 0;
        const redirectLocation = response.headers.location;

        if (
          statusCode >= 300 &&
          statusCode < 400 &&
          redirectLocation &&
          redirectsLeft > 0
        ) {
          const redirectedUrl = new URL(redirectLocation, url).toString();
          response.resume();
          fetchXml(redirectedUrl, timeoutMs, redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTP ${statusCode} при запросе ${url}`));
          return;
        }

        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on('end', () => {
          const body = Buffer.concat(chunks);
          resolve(decodeXmlBuffer(body, response.headers['content-type']));
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Таймаут ${timeoutMs}ms при запросе ${url}`));
    });

    request.on('error', reject);
  });
}

async function fetchProductPageAttributes(
  url: string,
): Promise<ParsedOfferParam[]> {
  const html = await fetchXml(normalizeTechnodeusProductPageUrl(url), 45_000);
  return extractTechnodeusProductPageAttributes(html);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

function mergeOfferParams(
  offerParams: ParsedOfferParam[],
  pageParams: ParsedOfferParam[],
): ParsedOfferParam[] {
  const merged = new Map<string, ParsedOfferParam>();

  for (const param of [...offerParams, ...pageParams]) {
    const name = param.name.trim();
    const value = param.value.trim();
    if (!name || !value) continue;

    const key = `${name.toLowerCase().replace(/ё/g, 'е')}::${value
      .toLowerCase()
      .replace(/ё/g, 'е')}`;
    if (!merged.has(key)) {
      merged.set(key, { name, value });
    }
  }

  return Array.from(merged.values());
}

function getTagContent(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  return match ? match[1] : '';
}

function getSingleTagValue(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  return match ? cleanXmlText(match[1]) : '';
}

function getAllTagValues(block: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const values: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(block)) !== null) {
    const value = cleanXmlText(match[1]);
    if (value) values.push(value);
  }

  return values;
}

function toBoolean(raw: string, fallback: boolean): boolean {
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  return !(normalized === 'false' || normalized === '0' || normalized === 'no');
}

function normalizeForMatch(input: string): string {
  return ` ${input
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some(
    (term) => text.includes(` ${term} `) || text.includes(term),
  );
}

function extractInt(text: string, regex: RegExp): number | null {
  const match = text.match(regex);
  if (!match || !match[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function extractMaxChipGeneration(text: string): number | null {
  const regex = /\bm\s*([0-9]{1,2})\b/g;
  let max: number | null = null;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isNaN(parsed)) continue;
    if (max === null || parsed > max) max = parsed;
  }

  return max;
}

function buildCategoryPath(
  categoryId: string,
  categories: Map<string, ParsedCategory>,
): string[] {
  const pathItems: string[] = [];
  const visited = new Set<string>();
  let cursor: string | null = categoryId;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const category = categories.get(cursor);
    if (!category) break;
    pathItems.push(category.name);
    cursor = category.parentId;
  }

  return pathItems.reverse();
}

function cleanCategoryPath(pathItems: string[]): string[] {
  return pathItems.filter((item) => {
    const normalized = item.toLowerCase().replace(/ё/g, 'е').trim();
    return normalized !== 'каталог товаров' && normalized !== 'каталог';
  });
}

function inferSectionFromPath(pathItems: string[], brand: string): string {
  const normalizedBrand = brand.toLowerCase().replace(/ё/g, 'е');
  const normalizedPath = pathItems.map((item) =>
    item.toLowerCase().replace(/ё/g, 'е'),
  );
  const index = normalizedPath.findIndex((item) => item === normalizedBrand);

  if (index >= 0 && pathItems[index + 1]) return pathItems[index + 1];
  if (pathItems.length > 1) return pathItems[pathItems.length - 2];
  if (pathItems.length === 1) return pathItems[0];
  return 'Другое';
}

function isAppleWatchAllowed(normalizedText: string): boolean {
  const se = extractInt(normalizedText, /\bse\s*([0-9]{1,2})\b/);
  if (se !== null) return se >= 2;

  const series = extractInt(normalizedText, /\bseries\s*([0-9]{1,2})\b/);
  if (series !== null) return series >= 10;

  const watchNumber = extractInt(normalizedText, /\bwatch\s*([0-9]{1,2})\b/);
  if (watchNumber !== null) return watchNumber >= 10;

  const ultra = extractInt(normalizedText, /\bultra\s*([0-9]{1,2})\b/);
  if (ultra !== null) return ultra >= 2;

  if (normalizedText.includes(' ultra ')) {
    return false;
  }

  return false;
}

function classifyOffer(
  offer: ParsedOffer,
  categoryPath: string[],
): MatchResult {
  if (!offer.available || offer.disabled) {
    return { include: false, reason: 'не в наличии или отключено' };
  }

  const pathText = categoryPath.join(' ');
  const paramsText = offer.params
    .map((param) => `${param.name} ${param.value}`)
    .join(' ');
  const productNameCombined = normalizeForMatch(
    `${offer.name} ${offer.vendorPath}`,
  );
  const combined = normalizeForMatch(
    `${offer.name} ${offer.vendorPath} ${pathText} ${paramsText}`,
  );
  const pathNormalized = normalizeForMatch(pathText);

  if (containsAny(combined, SERVICE_EXCLUDE_TERMS)) {
    return { include: false, reason: 'служебная услуга' };
  }

  const isCatalogAccessory = isAccessoryLikeProduct({
    productName: offer.name,
    sourcePath: pathText,
    categoryPath,
    attributes: offer.params,
  });
  const hasAccessoryWords =
    isCatalogAccessory || containsAny(productNameCombined, ACCESSORY_TERMS);
  const explicitNonAppleDeviceBrand = inferNonAppleDeviceBrandFromProductName(
    offer.name,
    offer.vendorPath,
  );

  if (explicitNonAppleDeviceBrand && hasAccessoryWords) {
    return {
      include: true,
      brand: explicitNonAppleDeviceBrand,
      subcategory: 'Аксессуары',
      reason: `${explicitNonAppleDeviceBrand.toLowerCase()} accessories`,
    };
  }

  const isApple =
    !explicitNonAppleDeviceBrand &&
    containsAny(combined, [
      'apple',
      'iphone',
      'airpods',
      'macbook',
      'imac',
      'mac mini',
      'mac studio',
      'mac pro',
      'ipad',
      'airtag',
      'homepod',
      'vision pro',
      'trackpad',
      'magic keyboard',
      'apple watch',
    ]);

  const isBeats = containsAny(productNameCombined, [' beats ', 'beats']);
  if (isBeats) {
    const headphoneTerms = [
      'наушник',
      'headphone',
      'earbud',
      'buds',
      'studio',
      'solo',
      'fit',
      'powerbeats',
    ];
    if (
      containsAny(combined, [' pro ']) &&
      containsAny(combined, headphoneTerms) &&
      !hasAccessoryWords
    ) {
      return {
        include: true,
        brand: 'Beats',
        subcategory: 'Наушники',
        reason: 'beats pro only',
      };
    }
    return { include: false, reason: 'beats только pro модели' };
  }

  if (isApple) {
    const isPhone = containsAny(combined, ['iphone']);
    const isWatch = containsAny(combined, [
      'apple watch',
      'watch series',
      'watch se',
      'watch ultra',
    ]);
    const isHeadphones = containsAny(combined, ['airpods', 'наушники apple']);
    const isLaptop = containsAny(combined, ['macbook']);
    const isComputer = containsAny(combined, [
      'imac',
      'mac mini',
      'mac studio',
      'mac pro',
    ]);
    const isKeyboard = containsAny(combined, ['keyboard', 'клавиатур']);
    const isTrackpad = containsAny(combined, ['trackpad', 'трекпад']);
    const isTablet = containsAny(combined, ['ipad']);
    const isExplicitAppleAccessory =
      hasAccessoryWords ||
      containsAny(productNameCombined, [
        'для iphone',
        'для ipad',
        'для apple watch',
        'для airpods',
        'для macbook',
        'apple pencil',
        'magsafe charger',
        'battery pack',
      ]);

    if (isExplicitAppleAccessory) {
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Аксессуары',
        reason: 'apple accessories',
      };
    }

    if (isLaptop || isComputer) {
      const chipGeneration = extractMaxChipGeneration(combined);
      if (chipGeneration === null || chipGeneration < 4) {
        return { include: false, reason: 'apple mac ниже чипа m4' };
      }
    }

    if (isHeadphones)
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Наушники',
        reason: 'apple headphones',
      };
    if (isLaptop)
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Ноутбуки',
        reason: 'apple macbook m4+',
      };
    if (isComputer)
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Компьютеры',
        reason: 'apple computers m4+',
      };
    if (isKeyboard)
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Клавиатуры',
        reason: 'apple keyboards',
      };
    if (isTrackpad)
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Трекпады',
        reason: 'apple trackpads',
      };
    if (isTablet)
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Планшеты',
        reason: 'apple tablets',
      };
    if (isWatch) {
      if (!isAppleWatchAllowed(combined)) {
        return { include: false, reason: 'apple watch ниже series 10 / se2' };
      }
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Часы',
        reason: 'apple watch 10+/se2+',
      };
    }
    if (isPhone)
      return {
        include: true,
        brand: 'Apple',
        subcategory: 'Телефоны',
        reason: 'apple phones',
      };

    return {
      include: true,
      brand: 'Apple',
      subcategory: 'Другое',
      reason: 'apple other',
    };
  }

  const isSamsung = containsAny(combined, ['samsung', 'galaxy']);
  if (isSamsung) {
    const isTablet = containsAny(combined, [
      'galaxy tab',
      ' tab s',
      ' tab a',
      'планшет',
    ]);
    const isWatch = containsAny(combined, ['galaxy watch', ' watch ']);
    const isHeadphones = containsAny(combined, ['buds', 'наушник']);
    const isAccessory =
      hasAccessoryWords || containsAny(pathNormalized, ['аксессуар']);
    const isPhone = containsAny(combined, [
      'смартфон',
      'phone',
      'galaxy s',
      'galaxy z',
      'galaxy a',
      'galaxy m',
      'galaxy note',
      'samsung galaxy',
    ]);

    if (isAccessory) {
      return {
        include: true,
        brand: 'Samsung',
        subcategory: 'Аксессуары',
        reason: 'samsung accessories',
      };
    }

    if (isTablet) {
      const tabSeries = extractInt(
        combined,
        /\btab\s*(?:s|a)?\s*([0-9]{1,2})\b/,
      );
      if (tabSeries === null || tabSeries < 10) {
        return { include: false, reason: 'samsung tab ниже 10 серии' };
      }

      return {
        include: true,
        brand: 'Samsung',
        subcategory: 'Планшеты',
        reason: 'samsung tab10+',
      };
    }

    if (isWatch) {
      if (containsAny(combined, [' classic '])) {
        return { include: false, reason: 'samsung watch classic исключен' };
      }

      return {
        include: true,
        brand: 'Samsung',
        subcategory: 'Часы',
        reason: 'samsung watch non-classic',
      };
    }

    if (isHeadphones) {
      return {
        include: true,
        brand: 'Samsung',
        subcategory: 'Наушники',
        reason: 'samsung headphones',
      };
    }

    if (isPhone) {
      return {
        include: true,
        brand: 'Samsung',
        subcategory: 'Телефоны',
        reason: 'samsung phones',
      };
    }

    return { include: false, reason: 'samsung вне целевых разделов' };
  }

  const isDyson = containsAny(combined, ['dyson']);
  if (isDyson) {
    if (containsAny(combined, ['headphone', 'наушник', 'dyson zone', 'zone'])) {
      return { include: false, reason: 'dyson наушники исключены' };
    }

    return {
      include: true,
      brand: 'Dyson',
      subcategory: inferSectionFromPath(categoryPath, 'Dyson'),
      reason: 'dyson all except headphones',
    };
  }

  const isGarmin = containsAny(combined, ['garmin']);
  if (isGarmin) {
    if (hasAccessoryWords) {
      return { include: false, reason: 'garmin аксессуары исключены' };
    }

    const watchTerms = [
      'watch',
      'часы',
      'fenix',
      'venu',
      'forerunner',
      'instinct',
      'tactix',
      'epix',
      'quatix',
      'marq',
      'vivoactive',
      'enduro',
      'descent',
    ];

    if (
      containsAny(combined, watchTerms) ||
      containsAny(pathNormalized, watchTerms)
    ) {
      return {
        include: true,
        brand: 'Garmin',
        subcategory: 'Часы',
        reason: 'garmin watches',
      };
    }

    return { include: false, reason: 'garmin вне часов' };
  }

  const isMarshall = containsAny(combined, ['marshall']);
  if (isMarshall) {
    const speakerTerms = [
      'колонк',
      'speaker',
      'woburn',
      'stanmore',
      'acton',
      'emberton',
      'kilburn',
      'stockwell',
      'tufton',
      'middleton',
    ];
    const headphoneTerms = [
      'наушник',
      'headphone',
      'major',
      'minor',
      'monitor',
      'motif',
    ];

    if (containsAny(combined, speakerTerms)) {
      return {
        include: true,
        brand: 'Marshall',
        subcategory: 'Колонки',
        reason: 'marshall speakers',
      };
    }
    if (containsAny(combined, headphoneTerms)) {
      return {
        include: true,
        brand: 'Marshall',
        subcategory: 'Наушники',
        reason: 'marshall headphones',
      };
    }

    return { include: false, reason: 'marshall вне колонок/наушников' };
  }

  const isJbl = containsAny(combined, ['jbl']);
  if (isJbl) {
    const speakerTerms = [
      'колонк',
      'speaker',
      'flip',
      'charge',
      'xtreme',
      'boombox',
      'partybox',
      'pulse',
      'clip',
      'go ',
    ];
    const headphoneTerms = [
      'наушник',
      'headphone',
      'earbud',
      'tune',
      'live',
      'wave',
    ];

    if (containsAny(combined, speakerTerms)) {
      return {
        include: true,
        brand: 'JBL',
        subcategory: 'Колонки',
        reason: 'jbl speakers',
      };
    }
    if (containsAny(combined, headphoneTerms)) {
      return {
        include: true,
        brand: 'JBL',
        subcategory: 'Наушники',
        reason: 'jbl headphones',
      };
    }

    return { include: false, reason: 'jbl вне колонок/наушников' };
  }

  const isPixel = containsAny(combined, ['google pixel', ' pixel ']);
  if (isPixel) {
    if (
      containsAny(combined, [
        'buds',
        'watch',
        'tab',
        'tablet',
        'планшет',
        'наушник',
      ]) ||
      hasAccessoryWords
    ) {
      return { include: false, reason: 'pixel не телефон' };
    }
    return {
      include: true,
      brand: 'Pixel',
      subcategory: 'Телефоны',
      reason: 'pixel phones',
    };
  }

  const isOnePlus = containsAny(combined, ['oneplus', 'one plus']);
  if (isOnePlus) {
    if (
      containsAny(combined, [
        'buds',
        'watch',
        'pad',
        'tablet',
        'планшет',
        'наушник',
      ]) ||
      hasAccessoryWords
    ) {
      return { include: false, reason: 'oneplus не телефон' };
    }
    return {
      include: true,
      brand: 'OnePlus',
      subcategory: 'Телефоны',
      reason: 'oneplus phones',
    };
  }

  const isHonor = containsAny(combined, [' honor ', 'honor']);
  if (isHonor) {
    if (
      containsAny(combined, [
        'watch',
        'часы',
        'tablet',
        'pad',
        'планшет',
        'buds',
        'наушник',
      ]) ||
      hasAccessoryWords
    ) {
      return { include: false, reason: 'honor не телефон' };
    }
    return {
      include: true,
      brand: 'Honor',
      subcategory: 'Телефоны',
      reason: 'honor phones',
    };
  }

  const isNintendo = containsAny(combined, [
    'nintendo',
    'switch',
    'joy con',
    'joy-con',
  ]);
  if (isNintendo) {
    const consoleTerms = [
      'nintendo switch',
      'switch oled',
      'switch lite',
      'switch 2',
      'console',
      'пристав',
    ];
    const nonConsoleTerms = [
      'игра',
      'games',
      'картридж',
      'controller',
      'геймпад',
      'джойстик',
      'joy con',
      'joy-con',
    ];

    if (
      containsAny(combined, consoleTerms) &&
      !containsAny(combined, nonConsoleTerms)
    ) {
      return {
        include: true,
        brand: 'Nintendo',
        subcategory: 'Приставки',
        reason: 'nintendo consoles',
      };
    }

    return { include: false, reason: 'nintendo вне приставок' };
  }

  const isSony = containsAny(combined, [' sony ', 'playstation', 'ps5', 'ps4']);
  if (isSony) {
    const consoleTerms = [
      'playstation',
      'console',
      'пристав',
      'ps5',
      'ps4',
      'ps portal',
      'ps vr',
      'vr2',
      'playstation 5',
      'playstation 4',
    ];
    const gameTerms = [
      'игра',
      'game ',
      'disc',
      'диск',
      'blu ray',
      'для ps5',
      'для ps4',
    ];
    const accessoryTerms = [
      'геймпад',
      'controller',
      'dualshock',
      'dualsense',
      'джойстик',
      'гарнитур',
      'headset',
      'pulse elite',
      'pulse explore',
      'руль',
      'зарядн',
      'charging',
      'подставк',
      'vr2 sense',
      'камера',
      'camera',
    ];

    if (
      containsAny(combined, gameTerms) &&
      !hasAccessoryWords &&
      !containsAny(combined, accessoryTerms)
    ) {
      return {
        include: true,
        brand: 'Sony',
        subcategory: 'Игры',
        reason: 'sony games',
      };
    }

    if (
      containsAny(combined, consoleTerms) &&
      !hasAccessoryWords &&
      !containsAny(combined, accessoryTerms)
    ) {
      return {
        include: true,
        brand: 'Sony',
        subcategory: 'Приставки',
        reason: 'sony consoles',
      };
    }

    return { include: false, reason: 'sony вне приставок/игр' };
  }

  const isWhoop = containsAny(combined, ['whoop']);
  if (isWhoop) {
    const bandTerms = [
      'браслет',
      'band',
      'strap',
      'фитнес',
      'fitness',
      'tracker',
    ];
    if (containsAny(combined, bandTerms)) {
      return {
        include: true,
        brand: 'Whoop',
        subcategory: 'Фитнес браслеты',
        reason: 'whoop fitness bands',
      };
    }
    return { include: false, reason: 'whoop вне браслетов' };
  }

  const isRayBan = containsAny(combined, ['rayban', 'ray ban', 'ray-ban']);
  if (isRayBan) {
    if (containsAny(combined, ['glasses', 'очки', 'умные очки', 'meta'])) {
      return {
        include: true,
        brand: 'RayBan',
        subcategory: 'Умные очки',
        reason: 'rayban smart glasses',
      };
    }
    return { include: false, reason: 'rayban не умные очки' };
  }

  const isYandex = containsAny(combined, ['яндекс', 'yandex']);
  if (isYandex) {
    if (
      containsAny(combined, ['станци', 'station', 'колонк', 'alice', 'алиса'])
    ) {
      return {
        include: true,
        brand: 'Яндекс',
        subcategory: 'Станции',
        reason: 'yandex stations',
      };
    }
    return { include: false, reason: 'yandex не станция' };
  }

  const isInsta360 = containsAny(combined, ['insta360', 'insta 360']);
  if (isInsta360) {
    if (hasAccessoryWords) {
      return { include: false, reason: 'insta360 аксессуары исключены' };
    }

    const stabilizerTerms = ['flow', 'стабилиз', 'gimbal'];
    const cameraTerms = [
      'camera',
      'камера',
      'one x',
      'one rs',
      'x4',
      'x5',
      'go 3',
      'ace',
    ];

    if (containsAny(combined, stabilizerTerms)) {
      return {
        include: true,
        brand: 'Insta360',
        subcategory: 'Стабилизаторы',
        reason: 'insta360 stabilizers',
      };
    }
    if (containsAny(combined, cameraTerms)) {
      return {
        include: true,
        brand: 'Insta360',
        subcategory: 'Камеры',
        reason: 'insta360 cameras',
      };
    }

    return { include: false, reason: 'insta360 вне камер/стабилизаторов' };
  }

  const isDji = containsAny(combined, [' dji ', 'dji']);
  if (isDji) {
    const industrialTerms = [
      'matrice',
      'agras',
      'enterprise',
      'dock',
      'dock 2',
      'm30',
      'm300',
      'm350',
      'm4e',
      'm4t',
      'm3e',
      'm3t',
      'rtk',
      'flycart',
      'промышл',
      'сельхоз',
      'термал',
      'thermal',
    ];

    if (containsAny(combined, industrialTerms)) {
      return { include: false, reason: 'dji industrial excluded' };
    }

    const stabilizerTerms = ['ronin', 'osmo mobile', 'gimbal', 'стабилиз'];
    const cameraTerms = [
      'camera',
      'камера',
      'osmo pocket',
      'action',
      'pocket',
      'cine',
    ];
    const droneTerms = [
      'drone',
      'квадрокоптер',
      'mavic',
      'mini ',
      'avata',
      'neo',
      'fpv',
      'inspire',
      'air ',
    ];

    if (containsAny(combined, stabilizerTerms)) {
      return {
        include: true,
        brand: 'DJI',
        subcategory: 'Стабилизаторы',
        reason: 'dji stabilizers',
      };
    }
    if (containsAny(combined, cameraTerms)) {
      return {
        include: true,
        brand: 'DJI',
        subcategory: 'Камеры',
        reason: 'dji cameras',
      };
    }
    if (containsAny(combined, droneTerms)) {
      return {
        include: true,
        brand: 'DJI',
        subcategory: 'Квадрокоптеры',
        reason: 'dji drones',
      };
    }

    return { include: false, reason: 'dji вне целевых разделов' };
  }

  return { include: false, reason: 'бренд не в целевом списке' };
}

function parseCategories(xml: string): Map<string, ParsedCategory> {
  const categoriesBlock = getTagContent(xml, 'categories');
  if (!categoriesBlock) {
    throw new Error('Не найден блок <categories> в XML фиде');
  }

  const categoryRegex = /<category\b([^>]*)>([\s\S]*?)<\/category>/gi;
  const result = new Map<string, ParsedCategory>();
  let match: RegExpExecArray | null;

  while ((match = categoryRegex.exec(categoriesBlock)) !== null) {
    const attrs = parseAttributes(match[1]);
    const id = attrs.id;
    if (!id) continue;

    result.set(id, {
      id,
      parentId: attrs.parentId || null,
      name: cleanXmlText(match[2]),
    });
  }

  return result;
}

function parseOffers(xml: string): ParsedOffer[] {
  const offersBlock = getTagContent(xml, 'offers');
  if (!offersBlock) {
    throw new Error('Не найден блок <offers> в XML фиде');
  }

  const offerRegex = /<offer\b([^>]*)>([\s\S]*?)<\/offer>/gi;
  const offers: ParsedOffer[] = [];
  let match: RegExpExecArray | null;

  while ((match = offerRegex.exec(offersBlock)) !== null) {
    const attrs = parseAttributes(match[1]);
    const body = match[2];
    const params: ParsedOfferParam[] = [];

    const paramRegex = /<param\b([^>]*)>([\s\S]*?)<\/param>/gi;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(body)) !== null) {
      const paramAttrs = parseAttributes(paramMatch[1]);
      const paramName = (paramAttrs.name || '').trim();
      const paramValue = cleanXmlText(paramMatch[2]);
      if (!paramName || !paramValue) continue;
      params.push({ name: paramName, value: paramValue });
    }

    offers.push({
      id: attrs.id || '',
      groupId: attrs.group_id || null,
      available: toBoolean(attrs.available, true),
      disabled: toBoolean(getSingleTagValue(body, 'disabled'), false),
      url: getSingleTagValue(body, 'url'),
      price: getSingleTagValue(body, 'price'),
      oldPrice: getSingleTagValue(body, 'oldprice'),
      currencyId: getSingleTagValue(body, 'currencyId') || 'RUB',
      categoryId: getSingleTagValue(body, 'categoryId'),
      pictures: getAllTagValues(body, 'picture'),
      name: getSingleTagValue(body, 'name'),
      vendorPath: getSingleTagValue(body, 'vendor'),
      vendorCode: getSingleTagValue(body, 'vendorCode'),
      description: stripHtml(getSingleTagValue(body, 'description')),
      params,
    });
  }

  return offers;
}

async function main() {
  const sourceUrl = readArg('--source') || DEFAULT_SOURCE_URL;
  const outputPathArg = readArg('--output');
  const outputPath = outputPathArg
    ? path.isAbsolute(outputPathArg)
      ? outputPathArg
      : path.resolve(process.cwd(), outputPathArg)
    : DEFAULT_OUTPUT_PATH;
  const dryRun = process.argv.includes('--dry-run');
  const pageAttributesEnabled = !process.argv.includes(
    '--skip-page-attributes',
  );
  const pageAttributeConcurrency = readPositiveIntArg(
    '--page-attribute-concurrency',
    6,
  );
  const limitArg = readArg('--limit');
  const limit = limitArg ? Number.parseInt(limitArg, 10) : null;

  if (limitArg && (limit === null || Number.isNaN(limit) || limit <= 0)) {
    throw new Error(`Некорректное значение --limit: ${limitArg}`);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  📡 Technodeus Parser → products.xlsx');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Источник: ${sourceUrl}`);
  console.log(`Выходной файл: ${outputPath}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`HTML-характеристики: ${pageAttributesEnabled}`);
  if (pageAttributesEnabled) {
    console.log(`Параллельность HTML-характеристик: ${pageAttributeConcurrency}`);
  }
  if (limit) console.log(`Лимит строк: ${limit}`);
  console.log('');

  const xml = await fetchXml(sourceUrl);
  console.log(`✅ XML загружен: ${(xml.length / (1024 * 1024)).toFixed(2)} MB`);

  const categories = parseCategories(xml);
  const offers = parseOffers(xml);

  console.log(`✅ Категорий: ${categories.size}`);
  console.log(`✅ Офферов: ${offers.length}`);
  console.log('');

  const includedOffers: IncludedOffer[] = [];
  const includeReasonCounter = new Map<string, number>();
  const skipReasonCounter = new Map<string, number>();
  const brandCounter = new Map<string, number>();
  const sectionCounter = new Map<string, number>();
  const dynamicHeaders = new Set<string>([
    'Категория источника',
    'Путь источника',
    'ID оффера',
    'Группа оффера',
  ]);

  for (const offer of offers) {
    if (!offer.name || !offer.categoryId) {
      const reason = 'пустое имя или categoryId';
      skipReasonCounter.set(reason, (skipReasonCounter.get(reason) || 0) + 1);
      continue;
    }

    const pathItems = cleanCategoryPath(
      buildCategoryPath(offer.categoryId, categories),
    );
    const match = classifyOffer(offer, pathItems);

    if (!match.include) {
      skipReasonCounter.set(
        match.reason,
        (skipReasonCounter.get(match.reason) || 0) + 1,
      );
      continue;
    }

    const leafSection = pathItems[pathItems.length - 1] || match.subcategory;
    const normalizedPath = normalizeParsedCategoryPath({
      productName: offer.name,
      topCategory: match.brand,
      subcategory: match.subcategory,
      section: leafSection,
      sourcePath: pathItems.join(' > '),
      categoryPath: pathItems,
      attributes: offer.params,
    });
    includedOffers.push({
      offer,
      match,
      pathItems,
      leafSection,
      normalizedPath,
    });

    includeReasonCounter.set(
      match.reason,
      (includeReasonCounter.get(match.reason) || 0) + 1,
    );
    brandCounter.set(match.brand, (brandCounter.get(match.brand) || 0) + 1);
    const sectionKey = `${match.brand} / ${match.subcategory}`;
    sectionCounter.set(sectionKey, (sectionCounter.get(sectionKey) || 0) + 1);

    if (limit && includedOffers.length >= limit) {
      break;
    }
  }

  console.log(`✅ Отобрано товаров: ${includedOffers.length}`);
  console.log(`⏭️ Пропущено товаров: ${offers.length - includedOffers.length}`);
  console.log('');

  const pageAttributesByUrl = new Map<string, ParsedOfferParam[]>();
  if (pageAttributesEnabled && includedOffers.length > 0) {
    const uniqueProductUrls = Array.from(
      new Set(
        includedOffers
          .map(({ offer }) => offer.url)
          .filter(Boolean)
          .map(normalizeTechnodeusProductPageUrl),
      ),
    );
    let processed = 0;
    let enriched = 0;
    let failed = 0;

    console.log(
      `🔎 Загружаем HTML-характеристики: ${uniqueProductUrls.length} страниц`,
    );

    await mapWithConcurrency(
      uniqueProductUrls,
      pageAttributeConcurrency,
      async (url) => {
        try {
          const attributes = await fetchProductPageAttributes(url);
          pageAttributesByUrl.set(url, attributes);
          if (attributes.length > 0) enriched += 1;
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `   ⚠️  Не удалось получить характеристики ${url}: ${message}`,
          );
        } finally {
          processed += 1;
          if (processed % 100 === 0 || processed === uniqueProductUrls.length) {
            console.log(
              `   HTML-характеристики: ${processed}/${uniqueProductUrls.length}`,
            );
          }
        }
      },
    );

    console.log(
      `✅ HTML-характеристики: заполнено ${enriched}, ошибок ${failed}`,
    );
    console.log('');
  }

  const includedRows: Record<string, string>[] = [];
  for (const {
    offer,
    match,
    pathItems,
    leafSection,
    normalizedPath,
  } of includedOffers) {
    const pageParams =
      pageAttributesByUrl.get(normalizeTechnodeusProductPageUrl(offer.url)) ||
      [];
    const mergedParams = mergeOfferParams(offer.params, pageParams);
    const variant = offer.params
      .map((param) => `${param.name}: ${param.value}`)
      .join('; ');
    const sku = offer.vendorCode || offer.id;

    const row: Record<string, string> = {
      Изображения: offer.pictures.join(';'),
      Название: offer.name,
      Артикул: sku,
      Цена: offer.price || '0',
      Валюта: offer.currencyId || 'RUB',
      Наличие: offer.available ? 'Да' : 'Нет',
      Категория: normalizedPath.topCategory || match.brand,
      Подкатегория: normalizedPath.subcategory || match.subcategory,
      Раздел: normalizedPath.section || leafSection,
      URL: offer.url,
      Описание: offer.description,
      Вариант: variant,
      'Старая цена': offer.oldPrice || '',
      'Категория источника': offer.vendorPath || '',
      'Путь источника': pathItems.join(' > '),
      'ID оффера': offer.id,
      'Группа оффера': offer.groupId || '',
    };

    for (const param of mergedParams) {
      const columnName = `Параметр: ${param.name}`;
      row[columnName] = param.value;
      dynamicHeaders.add(columnName);
    }

    includedRows.push(row);
  }

  const sortedHeaders = [...dynamicHeaders].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );
  const finalHeaders = [...BASE_HEADERS, ...sortedHeaders];
  const worksheet = XLSX.utils.json_to_sheet(includedRows, {
    header: finalHeaders,
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

  if (!dryRun) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    XLSX.writeFile(workbook, outputPath);
    console.log(`💾 Файл сохранен: ${outputPath}`);
  } else {
    console.log('🧪 Dry run: файл не записывался');
  }

  console.log('');
  console.log('📊 Бренды:');
  [...brandCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([brand, count]) => {
      console.log(`  - ${brand}: ${count}`);
    });

  console.log('');
  console.log('📊 Разделы:');
  [...sectionCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([section, count]) => {
      console.log(`  - ${section}: ${count}`);
    });

  console.log('');
  console.log('📊 Причины включения (top 10):');
  [...includeReasonCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([reason, count]) => {
      console.log(`  - ${reason}: ${count}`);
    });

  console.log('');
  console.log('📊 Причины пропуска (top 15):');
  [...skipReasonCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([reason, count]) => {
      console.log(`  - ${reason}: ${count}`);
    });

  if (includedRows.length > 0) {
    console.log('');
    console.log('🧾 Примеры первых 5 товаров:');
    includedRows.slice(0, 5).forEach((row, index) => {
      console.log(
        `  ${index + 1}. [${row['Категория']} / ${row['Подкатегория']}] ${row['Название']} — ${row['Цена']} ${row['Валюта']}`,
      );
    });
  }

  console.log('');
  console.log('✅ Парсинг завершен');
}

main().catch((error) => {
  console.error(
    '❌ Ошибка парсера:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
