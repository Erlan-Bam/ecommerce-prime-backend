INSERT INTO "StaticPageSeo" (
  "id", "path", "name", "title", "isActive", "createdAt", "updatedAt"
) VALUES
  ('static-seo-about', '/about', 'О компании', 'О компании', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('static-seo-delivery', '/delivery', 'Доставка и самовывоз', 'Доставка и самовывоз', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('static-seo-warranty', '/warranty', 'Гарантия и возврат', 'Гарантия и возврат', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('static-seo-contacts', '/contacts', 'Контакты', 'Контакты', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('static-seo-promotions', '/promotions', 'Акции и специальные предложения', 'Акции и специальные предложения', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('static-seo-trade-in', '/trade-in', 'Trade-in', 'Trade-in', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("path") DO NOTHING;
