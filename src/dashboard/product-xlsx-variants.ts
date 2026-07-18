type ProductXlsxAttribute = {
  name: string;
  value: string;
};

type ProductXlsxRow = Record<string, unknown>;

type VariantConfiguration = {
  color?: string;
  memory?: string;
  sim?: string;
  esim?: string;
  price: number;
  oldPrice?: number | null;
  linkedProductId?: string | null;
  [key: string]: unknown;
};

const CONFIGURATION_ATTRIBUTE_NAMES = new Set([
  'конфигурации',
  'конфигурации товара',
  'конфигурации цены',
  'variant configurations',
  'product configurations',
  'configurations',
]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function normalizeLookupKey(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') return null;

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

function cleanString(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isConfigurationAttributeName(name: string): boolean {
  return CONFIGURATION_ATTRIBUTE_NAMES.has(normalizeText(name));
}

function findConfigurationAttributeIndex(
  attributes: ProductXlsxAttribute[],
): number {
  return attributes.findIndex((attribute) =>
    isConfigurationAttributeName(attribute.name),
  );
}

function parseConfigurations(value: string): VariantConfiguration[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const result: VariantConfiguration[] = [];
  parsed.forEach((item) => {
    if (!item || typeof item !== 'object') return;

    const row = item as Record<string, unknown>;
    const price = parseNumber(row.price);
    if (price === null || price < 0) return;

    result.push({
      ...row,
      color: cleanString(row.color),
      memory: cleanString(row.memory),
      sim: cleanString(row.sim),
      esim: cleanString(row.esim),
      price,
      oldPrice: parseNumber(row.oldPrice),
      linkedProductId: cleanString(row.linkedProductId) || undefined,
    });
  });

  return result;
}

function getSimLabel(config: VariantConfiguration): string {
  return cleanString(config.sim || config.esim);
}

function getVariantColumnIndex(header: string, prefix: string): number | null {
  const match = normalizeText(header).match(new RegExp(`^${prefix}\\s*(\\d+)$`));
  if (!match) return null;

  const index = Number.parseInt(match[1], 10);
  return Number.isFinite(index) && index > 0 ? index : null;
}

function readVariantColumnSim(row: ProductXlsxRow, index: number): string {
  return cleanString(row[`Симка ${index}`]);
}

function readVariantColumnPrice(
  row: ProductXlsxRow,
  index: number,
): number | null {
  return parseNumber(row[`Цена ${index}`]);
}

export function getFirstVariantPriceFromRow(row: ProductXlsxRow): number | null {
  const sim = readVariantColumnSim(row, 1);
  if (!sim) return null;

  return readVariantColumnPrice(row, 1);
}

export function getVariantPriceColumns(
  attributes: ProductXlsxAttribute[],
): Record<string, string | number> {
  const configAttribute = attributes.find((attribute) =>
    isConfigurationAttributeName(attribute.name),
  );
  if (!configAttribute) return {};

  const columns: Record<string, string | number> = {};
  const seenSimLabels = new Set<string>();
  let columnIndex = 1;

  parseConfigurations(configAttribute.value).forEach((config) => {
    const simLabel = getSimLabel(config);
    const simKey = normalizeLookupKey(simLabel);
    if (!simLabel || seenSimLabels.has(simKey)) return;

    seenSimLabels.add(simKey);
    columns[`Симка ${columnIndex}`] = simLabel;
    columns[`Цена ${columnIndex}`] = config.price;
    columnIndex += 1;
  });

  return columns;
}

export function applyVariantPriceColumnsToAttributes(
  attributes: ProductXlsxAttribute[],
  row: ProductXlsxRow,
): ProductXlsxAttribute[] {
  const configAttributeIndex = findConfigurationAttributeIndex(attributes);
  if (configAttributeIndex === -1) return attributes;

  const updatesBySim = new Map<string, { price: number; order: number }>();

  Object.entries(row).forEach(([header, value]) => {
    const index = getVariantColumnIndex(header, 'цена');
    if (index === null) return;

    const price = parseNumber(value);
    if (price === null || price < 0) return;

    const sim = readVariantColumnSim(row, index);
    if (!sim) return;

    updatesBySim.set(normalizeLookupKey(sim), { price, order: index });
  });

  if (updatesBySim.size === 0) return attributes;

  const configAttribute = attributes[configAttributeIndex];
  let didUpdate = false;
  const parsedConfigurations = parseConfigurations(configAttribute.value);
  const updatedConfigurations = parsedConfigurations.map((config) => {
    const update = updatesBySim.get(normalizeLookupKey(getSimLabel(config)));
    if (!update || update.price === config.price) return config;

    didUpdate = true;
    return { ...config, price: update.price };
  });

  const orderedConfigurations = updatedConfigurations
    .map((config, originalIndex) => ({
      config,
      originalIndex,
      order:
        updatesBySim.get(normalizeLookupKey(getSimLabel(config)))?.order ??
        Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.order - b.order || a.originalIndex - b.originalIndex)
    .map((item) => item.config);
  const didReorder = orderedConfigurations.some(
    (config, index) => config !== updatedConfigurations[index],
  );

  if (!didUpdate && !didReorder) return attributes;

  return attributes.map((attribute, index) =>
    index === configAttributeIndex
      ? {
          ...attribute,
          value: JSON.stringify(orderedConfigurations),
        }
      : attribute,
  );
}
