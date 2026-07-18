import { BadRequestException } from '@nestjs/common';

const CONFIGURATION_ATTRIBUTE_NAMES = new Set([
  'конфигурации',
  'конфигурации товара',
  'конфигурации цены',
  'variant configurations',
  'product configurations',
  'configurations',
]);

type ProductPrice = {
  toNumber: () => number;
};

type ProductAttribute = {
  name: string;
  value: string;
};

type ProductWithVariantAttributes = {
  price: ProductPrice;
  attributes?: ProductAttribute[];
};

export type CartVariantInput = {
  variantKey?: string | null;
  variantLabel?: string | null;
};

type ProductVariantConfiguration = {
  color: string;
  memory: string;
  sim: string;
  esim: string;
  price: number;
};

export type ResolvedCartPricing = {
  unitPrice: number;
  variantKey: string | null;
  variantLabel: string | null;
};

const normalizeText = (value: string) =>
  value.toLowerCase().replace(/ё/g, 'е').trim();

const normalizeKeyPart = (value?: string | null) =>
  normalizeText(value || '')
    .replace(/[‐‑‒–—-]/g, ' ')
    .replace(/\s*\+\s*/g, '+')
    .replace(/\s+/g, ' ');

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value
      .replace(/\u00A0/g, '')
      .replace(/\s+/g, '')
      .replace(/₽|руб\.?/gi, '')
      .replace(',', '.')
      .trim();
    if (!normalized) return null;

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const isConfigurationAttribute = (name: string) =>
  CONFIGURATION_ATTRIBUTE_NAMES.has(normalizeText(name));

export const getCartVariantKey = (
  config: Pick<
    ProductVariantConfiguration,
    'color' | 'memory' | 'sim' | 'esim'
  >,
) =>
  [
    normalizeKeyPart(config.color),
    normalizeKeyPart(config.memory),
    normalizeKeyPart(config.sim),
    normalizeKeyPart(config.esim),
  ].join('::');

export const formatCartVariantLabel = (
  config: Pick<
    ProductVariantConfiguration,
    'color' | 'memory' | 'sim' | 'esim'
  >,
) =>
  [config.memory, config.color, config.sim, config.esim]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' / ');

const parseConfigurationValue = (
  value: string,
): ProductVariantConfiguration[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const price = parseNumber(row.price);
    if (price === null || price < 0) return [];

    return [
      {
        color: String(row.color ?? '').trim(),
        memory: String(row.memory ?? '').trim(),
        sim: String(row.sim ?? '').trim(),
        esim: String(row.esim ?? '').trim(),
        price,
      },
    ];
  });
};

export const resolveCartPricing = (
  product: ProductWithVariantAttributes,
  input: CartVariantInput = {},
): ResolvedCartPricing => {
  const basePrice = product.price.toNumber();
  const variantKey = input.variantKey?.trim();

  if (!variantKey) {
    return {
      unitPrice: basePrice,
      variantKey: null,
      variantLabel: null,
    };
  }

  const configurations = (product.attributes || [])
    .filter((attribute) => isConfigurationAttribute(attribute.name))
    .flatMap((attribute) => parseConfigurationValue(attribute.value));
  const matchedConfiguration = configurations.find(
    (configuration) => getCartVariantKey(configuration) === variantKey,
  );

  if (!matchedConfiguration) {
    throw new BadRequestException('Selected product variant is not available');
  }

  return {
    unitPrice: matchedConfiguration.price,
    variantKey,
    variantLabel:
      input.variantLabel?.trim() ||
      formatCartVariantLabel(matchedConfiguration),
  };
};
