interface Configuration {
  sim?: string;
  price?: number;
}

const COLORS = [
  'Black',
  'White',
  'Midnight',
  'Starlight',
  'Graphite',
  'Gold',
  'Natural',
  'Slate Black',
  'Rose Gold',
  'Jet Black',
  'Silver',
  'Space Gray',
  'Dark Green',
  'Blue',
  'Light Blue',
  'Anchor Blue',
  'Charcoal',
  'Glacier',
  'Burgundy',
  'Red',
  'Pink',
  'Green',
  'Yellow',
  'Ultramarine',
  'Teal',
  'Desert',
  'Sky Blue',
  'Light Gold',
  'Cloud White',
  'Space Black',
  'Mist Blue',
  'Sage',
  'Lavender',
  'Deep Blue',
  'Cosmic Orange',
  'Purple',
  'Orange',
  'Citrus',
  'Indigo',
  'Blush',
  'Silver Shadow',
  'Icy Blue',
  'Pink Gold',
  'Mint',
  'White Silver',
  'Silver Blue',
  'Violet',
  'Cream',
  'Navy',
  'Lilac',
  'Olive',
  'Pistachio',
  'Blueberry',
  'Gray Green',
  'Titanium',
  'Gray',
  'Light Pink',
  'Golden White',
  'Golden',
  'Beige',
  'Coconut White',
  'Guava Soda',
  'Orange Soda',
  'Mulberry Black',
  'Blaze Purple',
  'Blush Gold',
  'Orange Ocean',
  'Graphite Black',
  'Infinite Black',
  'Ultra Violet',
  'Sand Storm',
  'Charcoal Black',
  'Mint Breeze',
  'Obsidian',
  'Snow',
].sort((a, b) => b.length - a.length);

export function extractColor(productName: string): string | undefined {
  for (const color of COLORS) {
    if (productName.includes(color)) {
      return color;
    }
  }
}

export function extractMemory(productName: string): string | undefined {
  return productName.match(/\d+(GB|TB)/gi)?.[0];
}

export function normalizeProductName(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .replace('mm', 'мм')
    .replace('GB', 'ГБ')
    .replace('TB', 'ТБ')
    .trim();
}

export function memoryToGb(string?: string): number | undefined {
  const memory = string?.match(/(\d+)\s*(GB|TB|ГБ|ТБ)/i);
  if (!memory) return undefined;
  return (
    Number(memory[1]) *
    (['TB', 'ТБ'].includes(memory[2].toUpperCase()) ? 1024 : 1)
  );
}

export function findTechName(
  techNames: string[],
  model: string,
): string | undefined {
  let partialMatchedName: string;
  for (let techName of techNames) {
    techName = techName.toLowerCase();
    if (model === techName) {
      return model;
    }
    if (model.includes(techName)) {
      if (partialMatchedName) {
        // If model name matches 2 or more tech names,
        // we can't definitely tell where model belongs
        return;
      }
      partialMatchedName = techName;
    }
  }
  return partialMatchedName;
}

export function addMissingPrefix(full: string, short: string): string {
  const fullWords = full.trim().split(/\s+/);
  const shortWords = short.trim().split(/\s+/);
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  // ищем позицию в full, с которой совпадает больше всего слов из начала short
  let bestIdx = -1;
  let bestLen = 0;
  for (let i = 0; i < fullWords.length; i++) {
    let len = 0;
    while (
      i + len < fullWords.length &&
      len < shortWords.length &&
      eq(fullWords[i + len], shortWords[len])
    ) {
      len++;
    }
    if (len > bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }

  // совпадений нет или префикса нет (short уже начинается так же, как full)
  if (bestIdx <= 0) return short;

  const prefix = fullWords.slice(0, bestIdx).join(' ');
  return `${prefix} ${short}`;
}

export function includesAll(productName: string, model: string) {
  for (const part of model.split(' ')) {
    if (!productName.includes(part)) {
      return false;
    }
  }
  return true;
}

export function normalizeSim(sim?: string) {
  return sim?.toLowerCase().replace(/\s+/g, '').replace('nano+', 'nanosim+');
}

export function extractConfigurations(
  configurations: string,
): Configuration[] | undefined {
  try {
    const data = JSON.parse(configurations);
    if (Array.isArray(data)) {
      return data.map((elem) => ({
        ...elem,
        sim: normalizeSim(elem.sim),
      }));
    }
    return [{ ...data, sim: normalizeSim(data.sim) }];
  } catch {
    return undefined;
  }
}

export function extractPriceFromConfigurations(
  configurations: string,
  sim: string,
): number | undefined {
  try {
    return JSON.parse(configurations).find(
      (conf) => normalizeSim(conf.sim) === normalizeSim(sim),
    )?.price;
  } catch {
    return undefined;
  }
}
