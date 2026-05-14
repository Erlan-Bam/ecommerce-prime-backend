export type TechnodeusProductPageAttribute = {
  name: string;
  value: string;
};

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, code) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const parsed = Number.parseInt(code.slice(2), 16);
      return Number.isNaN(parsed) ? entity : String.fromCodePoint(parsed);
    }

    if (code.startsWith('#')) {
      const parsed = Number.parseInt(code.slice(1), 10);
      return Number.isNaN(parsed) ? entity : String.fromCodePoint(parsed);
    }

    return HTML_ENTITIES[code] ?? entity;
  });
}

function cleanHtmlText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCharacteristicsTable(html: string): string | null {
  const profileMatch = html.match(/<div\b[^>]*id=["']profile["'][^>]*>/i);
  const searchStart = profileMatch?.index ?? 0;
  const afterProfile = html.slice(searchStart);
  const tableMatch = afterProfile.match(/<table\b[\s\S]*?<\/table>/i);

  return tableMatch ? tableMatch[0] : null;
}

export function extractTechnodeusProductPageAttributes(
  html: string,
): TechnodeusProductPageAttribute[] {
  const table = findCharacteristicsTable(html);
  if (!table) return [];

  const attributes: TechnodeusProductPageAttribute[] = [];
  const seen = new Set<string>();
  const rowRegex = /<tr\b[\s\S]*?<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(table)) !== null) {
    const cells = Array.from(
      rowMatch[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
      (match) => cleanHtmlText(match[1]),
    );
    const [name, value] = cells;
    if (!name || !value) continue;

    const key = `${name.toLowerCase()}::${value.toLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    attributes.push({ name, value });
  }

  return attributes;
}

export function normalizeTechnodeusProductPageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.trim();
  }
}
