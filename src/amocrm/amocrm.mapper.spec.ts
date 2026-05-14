import {
  buildAmoCrmContactPayload,
  buildAmoCrmOrderNote,
  normalizeAmoCrmPrice,
} from './amocrm.mapper';

describe('amoCRM mapper', () => {
  it('builds contact payload with phone, email and tags', () => {
    expect(
      buildAmoCrmContactPayload({
        name: 'Иван',
        email: 'ivan@example.com',
        phone: '+7 (999) 123-45-67',
        tags: ['site', 'registered-user'],
      }),
    ).toEqual({
      name: 'Иван',
      custom_fields_values: [
        {
          field_code: 'PHONE',
          values: [{ value: '+7 (999) 123-45-67', enum_code: 'WORK' }],
        },
        {
          field_code: 'EMAIL',
          values: [{ value: 'ivan@example.com', enum_code: 'WORK' }],
        },
      ],
      tags_to_add: [{ name: 'site' }, { name: 'registered-user' }],
    });
  });

  it('formats an order note with customer, delivery and items', () => {
    expect(
      buildAmoCrmOrderNote({
        id: 42,
        buyer: 'Мария',
        email: 'maria@example.com',
        phone: '+7 999 000-00-00',
        deliveryMethod: 'DELIVERY',
        paymentMethod: 'CASH',
        address: 'Москва, Барклая 6',
        comment: 'Позвонить заранее',
        items: [
          {
            quantity: 2,
            price: 150000,
            product: { name: 'iPhone 16 Pro' },
          },
        ],
        finalTotal: { toNumber: () => 300000 },
      }),
    ).toContain('Заказ #42');
    expect(
      buildAmoCrmOrderNote({
        id: 42,
        buyer: 'Мария',
        email: 'maria@example.com',
        phone: '+7 999 000-00-00',
        deliveryMethod: 'DELIVERY',
        paymentMethod: 'CASH',
        address: 'Москва, Барклая 6',
        comment: 'Позвонить заранее',
        items: [
          {
            quantity: 2,
            price: 150000,
            product: { name: 'iPhone 16 Pro' },
          },
        ],
        finalTotal: { toNumber: () => 300000 },
      }),
    ).toContain('iPhone 16 Pro x2 — 150000 ₽');
  });

  it('normalizes prices for amoCRM lead budget', () => {
    expect(normalizeAmoCrmPrice({ toNumber: () => 1234.56 })).toBe(1235);
    expect(normalizeAmoCrmPrice('789.10')).toBe(789);
    expect(normalizeAmoCrmPrice(undefined)).toBe(0);
  });
});
