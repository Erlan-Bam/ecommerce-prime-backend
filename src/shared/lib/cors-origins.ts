export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4200',
  'https://e-commerce-production-bf09.up.railway.app',
  'https://ecommerce-prime-backend-production.up.railway.app',
  'https://e-commerce-admin-production-9e9f.up.railway.app',
  'https://prime-electronics.ru',
  'https://admin-panel.prime-electronics.ru',
];

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function getCorsOrigins(
  env: Partial<Record<'FRONTEND_URL' | 'CORS_ORIGINS', string>> = process.env,
): string[] {
  const configuredOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  const frontendOrigin = env.FRONTEND_URL
    ? [normalizeOrigin(env.FRONTEND_URL)]
    : [];

  return Array.from(
    new Set([...DEFAULT_CORS_ORIGINS, ...frontendOrigin, ...configuredOrigins]),
  );
}
