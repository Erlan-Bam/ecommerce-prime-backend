import {
  applyVariantPriceColumnsToAttributes,
  getFirstVariantPriceFromRow,
  getVariantPriceColumns,
} from './product-xlsx-variants';

const attributes = [
  {
    name: 'Конфигурации',
    value: JSON.stringify([
      {
        color: 'Оранжевый',
        memory: '256 ГБ',
        sim: 'Nano Sim + eSim',
        esim: '',
        price: 149990,
        linkedProductId: 'product-108919',
      },
      {
        color: 'Оранжевый',
        memory: '256 ГБ',
        sim: 'eSim + eSim',
        esim: '',
        price: 145990,
        linkedProductId: 'product-108919',
      },
    ]),
  },
];

describe('product XLSX variant price helpers', () => {
  it('exports alternating SIM and price columns in configuration order', () => {
    expect(getVariantPriceColumns(attributes)).toEqual({
      'Симка 1': 'Nano Sim + eSim',
      'Цена 1': 149990,
      'Симка 2': 'eSim + eSim',
      'Цена 2': 145990,
    });
  });

  it('updates configuration prices from alternating SIM and price columns', () => {
    const result = applyVariantPriceColumnsToAttributes(attributes, {
      'Симка 1': 'Nano Sim + eSim',
      'Цена 1': '151990',
      'Симка 2': 'eSim + eSim',
      'Цена 2': '147990',
    });

    const configurations = JSON.parse(result[0].value);
    expect(configurations).toMatchObject([
      { sim: 'Nano Sim + eSim', price: 151990 },
      { sim: 'eSim + eSim', price: 147990 },
    ]);
  });

  it('reorders configurations by alternating SIM columns from the import row', () => {
    const result = applyVariantPriceColumnsToAttributes(attributes, {
      'Симка 1': 'eSim + eSim',
      'Цена 1': '145990',
      'Симка 2': 'Nano Sim + eSim',
      'Цена 2': '149990',
    });

    const configurations = JSON.parse(result[0].value);
    expect(configurations).toMatchObject([
      { sim: 'eSim + eSim', price: 145990 },
      { sim: 'Nano Sim + eSim', price: 149990 },
    ]);
  });

  it('uses the first variant price as the product row price when present', () => {
    expect(
      getFirstVariantPriceFromRow({
        Цена: '149990',
        'Симка 1': 'eSim + eSim',
        'Цена 1': '145990',
      }),
    ).toBe(145990);
  });

  it('leaves configurations unchanged when SIM labels do not match', () => {
    const result = applyVariantPriceColumnsToAttributes(attributes, {
      'Симка 1': '2 SIM',
      'Цена 1': '151990',
    });

    expect(result).toEqual(attributes);
  });
});
