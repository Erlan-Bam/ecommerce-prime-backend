import { BadRequestException } from '@nestjs/common';
import { getCartVariantKey, resolveCartPricing } from './cart-variant-pricing';

const product = {
  price: { toNumber: () => 84990 },
  attributes: [
    {
      name: 'Конфигурации',
      value: JSON.stringify([
        {
          color: 'Natural Titanium',
          memory: '128ГБ',
          sim: '',
          esim: '',
          price: 84990,
        },
        {
          color: 'Natural Titanium',
          memory: '256ГБ',
          sim: '',
          esim: '',
          price: '100 000 ₽',
        },
      ]),
    },
  ],
};

describe('cart variant pricing', () => {
  it('uses the base product price when no variant is selected', () => {
    expect(resolveCartPricing(product)).toEqual({
      unitPrice: 84990,
      variantKey: null,
      variantLabel: null,
    });
  });

  it('uses the selected variant price from product configurations', () => {
    const variantKey = getCartVariantKey({
      color: 'Natural Titanium',
      memory: '256ГБ',
      sim: '',
      esim: '',
    });

    expect(resolveCartPricing(product, { variantKey })).toEqual({
      unitPrice: 100000,
      variantKey,
      variantLabel: '256ГБ / Natural Titanium',
    });
  });

  it('matches keys normalized by the storefront for plus-separated SIM labels', () => {
    const iphoneProduct = {
      price: { toNumber: () => 153990 },
      attributes: [
        {
          name: 'Конфигурации',
          value: JSON.stringify([
            {
              color: 'Синий',
              memory: '2 ТБ',
              sim: 'eSim + eSim',
              esim: '',
              price: 153990,
            },
          ]),
        },
      ],
    };

    expect(
      resolveCartPricing(iphoneProduct, {
        variantKey: 'синий::2 тб::esim+esim::',
      }),
    ).toEqual({
      unitPrice: 153990,
      variantKey: 'синий::2 тб::esim+esim::',
      variantLabel: '2 ТБ / Синий / eSim + eSim',
    });
  });

  it('rejects an unavailable selected variant', () => {
    expect(() =>
      resolveCartPricing(product, {
        variantKey: 'black::1тб::::',
      }),
    ).toThrow(BadRequestException);
  });
});
