export const ACCESSORIES_CATEGORY_NAME = 'Аксессуары';

export type CategoryPathInput = {
  productName: string;
  topCategory?: string | null;
  subcategory?: string | null;
  section?: string | null;
  sourcePath?: string | null;
  categoryPath?: string[];
  attributes?: Array<{ name?: string | null; value?: string | null }>;
};

export type NormalizedCategoryPath = {
  topCategory: string | null;
  subcategory: string | null;
  section: string | null;
  isAccessory: boolean;
};

const ACCESSORY_CATEGORY_TERMS = [
  'аксессуар',
  'чехол',
  'чехлы',
  'защитное стекло',
  'защитные стекла',
  'стекла',
  'пленка',
  'пленки',
  'ремешок',
  'ремешки',
  'кабель',
  'кабели',
  'адаптер',
  'адаптеры',
  'зарядные устройства',
  'блоки питания',
  'держатель',
  'держатели',
  'подставка',
  'подставки',
  'стилус',
  'стилусы',
  'переходник',
  'переходники',
  'накладка',
  'накладки',
  'бампер',
  'бамперы',
];

const ACCESSORY_NAME_TERMS = [
  'аксессуар',
  'чехол',
  'чехлы',
  'защитное стекло',
  'защитные стекла',
  'стекло защитное',
  'пленка',
  'пленку',
  'ремешок',
  'ремешки',
  'кабель',
  'cable',
  'usb c cable',
  'адаптер',
  'adapter',
  'блок питания',
  'зарядное устройство',
  'зарядка',
  'charger',
  'wireless charger',
  'держатель',
  'подставка',
  'стилус',
  'apple pencil',
  'pencil',
  'переходник',
  'накладка',
  'бампер',
  'magsafe charger',
  'battery pack',
  'power bank',
  'power adapter',
  'screen protector',
  'protective glass',
  'protective film',
  'silicone case',
  'clear case',
  'case for',
  'cover for',
  'protective case',
  'strap for',
  'watch band',
  'charging stand',
  'charging dock',
  'adapter for',
];

const REAL_PRODUCT_CASE_PHRASES = [
  'charging case',
  'magsafe charging case',
  'wireless charging case',
  'зарядным футляром',
  'зарядный футляр',
  'зарядным кейсом',
  'зарядный кейс',
];

const REAL_DEVICE_NAME_TERMS = [
  'iphone',
  'ipad',
  'macbook',
  'imac',
  'mac mini',
  'mac studio',
  'mac pro',
  'airpods',
  'apple watch',
  'galaxy s',
  'galaxy z',
  'galaxy a',
  'galaxy m',
  'galaxy note',
  'galaxy tab',
  'galaxy watch',
  'samsung galaxy',
  'google pixel',
  'pixel',
  'oneplus',
  'one plus',
  'honor',
  'dyson',
  'garmin',
];

function clean(value?: string | null): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.replace(/\r/g, '').replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

export function normalizeCatalogText(value: string): string {
  return ` ${value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function containsTerm(text: string, term: string): boolean {
  const normalizedTerm = normalizeCatalogText(term).trim();
  return text.includes(` ${normalizedTerm} `) || text.includes(normalizedTerm);
}

function containsAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => containsTerm(text, term));
}

function isRealProductCasePhraseOnly(
  productText: string,
  fullText: string,
): boolean {
  const hasRealCasePhrase = containsAnyTerm(
    productText,
    REAL_PRODUCT_CASE_PHRASES,
  );
  if (!hasRealCasePhrase) return false;

  const hasExplicitAccessoryOutsideCase = ACCESSORY_NAME_TERMS.some((term) => {
    if (
      term.includes('case') ||
      term.includes('кейс') ||
      term.includes('футляр')
    ) {
      return false;
    }
    return containsTerm(fullText, term);
  });

  return !hasExplicitAccessoryOutsideCase;
}

function isRealDeviceName(productText: string): boolean {
  return containsAnyTerm(productText, REAL_DEVICE_NAME_TERMS);
}

export function isAccessoryLikeProduct(input: CategoryPathInput): boolean {
  const categoryPath = [
    input.topCategory,
    input.subcategory,
    input.section,
    input.sourcePath,
    ...(input.categoryPath || []),
  ]
    .filter((value): value is string => Boolean(clean(value)))
    .join(' ');
  const attributesText = (input.attributes || [])
    .map((attribute) => `${attribute.name || ''} ${attribute.value || ''}`)
    .join(' ');

  const productText = normalizeCatalogText(input.productName || '');
  const categoryText = normalizeCatalogText(categoryPath);
  const fullText = normalizeCatalogText(
    `${input.productName || ''} ${categoryPath} ${attributesText}`,
  );
  const productHasAccessoryTerm = containsAnyTerm(
    productText,
    ACCESSORY_NAME_TERMS,
  );

  if (isRealProductCasePhraseOnly(productText, fullText)) {
    return false;
  }

  if (productHasAccessoryTerm) {
    return true;
  }

  if (
    isRealDeviceName(productText) &&
    containsAnyTerm(categoryText, ACCESSORY_CATEGORY_TERMS)
  ) {
    return false;
  }

  if (containsAnyTerm(categoryText, ACCESSORY_CATEGORY_TERMS)) {
    return true;
  }

  if (isRealDeviceName(productText)) {
    return false;
  }

  return containsAnyTerm(fullText, ACCESSORY_NAME_TERMS);
}

function inferAccessorySection(input: CategoryPathInput): string {
  const fullText = normalizeCatalogText(
    `${input.productName || ''} ${input.section || ''} ${input.subcategory || ''} ${
      input.sourcePath || ''
    } ${(input.categoryPath || []).join(' ')}`,
  );

  if (
    containsAnyTerm(fullText, [
      'защитное стекло',
      'защитные стекла',
      'стекло защитное',
    ])
  ) {
    return 'Защитные стекла';
  }
  if (containsAnyTerm(fullText, ['пленка', 'пленки', 'protective film'])) {
    return 'Пленки';
  }
  if (
    containsAnyTerm(fullText, ['ремешок', 'ремешки', 'strap for', 'watch band'])
  ) {
    return 'Ремешки';
  }
  if (containsAnyTerm(fullText, ['кабель', 'кабели', 'cable', 'usb c cable'])) {
    return 'Кабели';
  }
  if (
    containsAnyTerm(fullText, [
      'адаптер',
      'переходник',
      'power adapter',
      'adapter for',
      'adapter',
    ])
  ) {
    return 'Адаптеры';
  }
  if (
    containsAnyTerm(fullText, [
      'зарядное устройство',
      'зарядка',
      'magsafe charger',
      'wireless charger',
      'charger',
      'charging stand',
      'charging dock',
    ])
  ) {
    return 'Зарядные устройства';
  }
  if (
    containsAnyTerm(fullText, [
      'держатель',
      'держатели',
      'подставка',
      'подставки',
    ])
  ) {
    return 'Держатели и подставки';
  }
  if (containsAnyTerm(fullText, ['стилус', 'стилусы'])) {
    return 'Стилусы';
  }
  if (
    containsAnyTerm(fullText, [
      'чехол',
      'чехлы',
      'накладка',
      'бампер',
      'silicone case',
      'clear case',
      'case for',
      'cover for',
      'protective case',
    ])
  ) {
    return 'Чехлы';
  }

  return ACCESSORIES_CATEGORY_NAME;
}

export function normalizeParsedCategoryPath(
  input: CategoryPathInput,
): NormalizedCategoryPath {
  const topCategory = clean(input.topCategory);
  const subcategory = clean(input.subcategory);
  const section = clean(input.section);
  const isAccessory = isAccessoryLikeProduct(input);

  if (!isAccessory) {
    return {
      topCategory,
      subcategory,
      section,
      isAccessory: false,
    };
  }

  return {
    topCategory,
    subcategory: ACCESSORIES_CATEGORY_NAME,
    section: inferAccessorySection(input),
    isAccessory: true,
  };
}

export function normalizeCategoryNamesForImport(
  input: CategoryPathInput,
): string[] {
  const normalized = normalizeParsedCategoryPath(input);
  const names = normalized.isAccessory
    ? [normalized.subcategory, normalized.section]
    : [normalized.topCategory, normalized.subcategory, normalized.section];

  return Array.from(
    new Set(names.filter((value): value is string => Boolean(clean(value)))),
  );
}
