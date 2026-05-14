import {
  normalizeParsedCategoryPath,
  isAccessoryLikeProduct,
} from './catalog-classification';

describe('catalog accessory classification', () => {
  it('moves iPhone cases out of phone categories into accessories', () => {
    const result = normalizeParsedCategoryPath({
      productName: 'Чехол Apple Silicone Case для iPhone 16 Pro Max',
      topCategory: 'Apple',
      subcategory: 'Смартфоны Apple iPhone',
      section: 'iPhone 16 Pro Max',
    });

    expect(result).toEqual({
      topCategory: 'Apple',
      subcategory: 'Аксессуары',
      section: 'Чехлы',
      isAccessory: true,
    });
  });

  it('moves AirPods covers out of headphones categories into accessories', () => {
    const result = normalizeParsedCategoryPath({
      productName: 'Чехол для AirPods Pro 2 силиконовый',
      topCategory: 'Apple',
      subcategory: 'Наушники',
      section: 'AirPods Pro 2',
    });

    expect(result).toEqual({
      topCategory: 'Apple',
      subcategory: 'Аксессуары',
      section: 'Чехлы',
      isAccessory: true,
    });
  });

  it('moves Samsung protective glass out of phone categories into accessories', () => {
    const result = normalizeParsedCategoryPath({
      productName: 'Защитное стекло Samsung Galaxy S25 Ultra',
      topCategory: 'Samsung',
      subcategory: 'Телефоны',
      section: 'Galaxy S',
    });

    expect(result).toEqual({
      topCategory: 'Samsung',
      subcategory: 'Аксессуары',
      section: 'Защитные стекла',
      isAccessory: true,
    });
  });

  it('does not treat real AirPods with charging case as an accessory', () => {
    expect(
      isAccessoryLikeProduct({
        productName: 'Apple AirPods Pro 2 with MagSafe Charging Case USB-C',
        categoryPath: ['Apple', 'Наушники', 'AirPods Pro 2'],
      }),
    ).toBe(false);
  });

  it('does not let a wrong accessory source path turn real devices into accessories', () => {
    expect(
      isAccessoryLikeProduct({
        productName: 'Apple MacBook Pro 16 MRW63 M3 Pro, 2023, 36GB, 512GB',
        topCategory: 'Apple',
        subcategory: 'Аксессуары',
        sourcePath: 'Apple > Аксессуары',
        attributes: [{ name: 'Блок зарядного устройства', value: '140 Вт' }],
      }),
    ).toBe(false);
  });

  it('keeps real smartphones in their phone category', () => {
    const result = normalizeParsedCategoryPath({
      productName: 'Samsung Galaxy S25 Ultra 256GB',
      topCategory: 'Samsung',
      subcategory: 'Телефоны',
      section: 'Galaxy S',
    });

    expect(result).toEqual({
      topCategory: 'Samsung',
      subcategory: 'Телефоны',
      section: 'Galaxy S',
      isAccessory: false,
    });
  });
});
