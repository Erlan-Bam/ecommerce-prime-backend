export const DEFAULT_ROBOTS_CONTENT = `User-agent: *
Allow: /
Disallow: /account/
Disallow: /checkout/
Disallow: /order-confirmation/
Disallow: /login
Disallow: /register
Disallow: /api/
Disallow: /*?

Sitemap: https://prime-electronics.ru/sitemap.xml`;

export type SeoCollectionAttributes = Record<string, string[]>;

export function normalizeRobotsContent(value?: string | null): string {
  const normalized = value?.replace(/\r\n?/g, "\n").trim();
  return normalized || DEFAULT_ROBOTS_CONTENT;
}

export function normalizeSeoCollectionAttributes(
  value?: Record<string, string[]> | null,
): SeoCollectionAttributes {
  const result: SeoCollectionAttributes = {};

  Object.entries(value || {}).forEach(([name, values]) => {
    const cleanName = name.trim();
    if (!cleanName || !Array.isArray(values)) return;

    const uniqueValues = Array.from(
      new Set(values.map((item) => item.trim()).filter(Boolean)),
    );
    if (uniqueValues.length > 0) {
      result[cleanName] = uniqueValues;
    }
  });

  return result;
}

export function normalizeRelatedProductIds(
  sourceProductId: string,
  productIds?: string[] | null,
): string[] {
  return Array.from(
    new Set(
      (productIds || []).map((id) => id.trim()).filter(
        (id) => Boolean(id) && id !== sourceProductId,
      ),
    ),
  );
}
