ALTER TABLE "Category"
ADD COLUMN IF NOT EXISTS "isMain" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "mainSortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "Category"
SET
  "isMain" = true,
  "mainSortOrder" = "sortOrder"
WHERE "parentId" IS NULL
  AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "Category_isMain_mainSortOrder_idx"
ON "Category"("isMain", "mainSortOrder");
