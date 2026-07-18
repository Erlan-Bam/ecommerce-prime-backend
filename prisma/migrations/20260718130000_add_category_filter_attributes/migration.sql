ALTER TABLE "Category"
ADD COLUMN IF NOT EXISTS "filterAttributes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Category"
SET "filterAttributes" = ARRAY[
  'Объём памяти',
  'Цвет',
  'SIM-карта',
  'Модификация'
]::TEXT[]
WHERE "slug" = 'apple'
  AND cardinality("filterAttributes") = 0;

UPDATE "Category"
SET "filterAttributes" = ARRAY[
  'Объём памяти',
  'Оперативная память',
  'Цвет'
]::TEXT[]
WHERE "slug" = 'samsung'
  AND cardinality("filterAttributes") = 0;
