import { getCorsOrigins } from './cors-origins';

describe('cors origins', () => {
  it('includes staging origins from environment variables', () => {
    expect(
      getCorsOrigins({
        FRONTEND_URL: 'https://seo.prime-electronics.ru/',
        CORS_ORIGINS:
          'https://seo.prime-electronics.ru, https://seo-admin.prime-electronics.ru',
      }),
    ).toEqual(
      expect.arrayContaining([
        'https://prime-electronics.ru',
        'https://seo.prime-electronics.ru',
        'https://seo-admin.prime-electronics.ru',
      ]),
    );
  });
});
