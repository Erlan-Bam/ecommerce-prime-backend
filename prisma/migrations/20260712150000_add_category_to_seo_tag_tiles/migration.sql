ALTER TABLE "SeoTagTile" ADD COLUMN "categoryId" TEXT;

CREATE INDEX "SeoTagTile_categoryId_idx" ON "SeoTagTile"("categoryId");

ALTER TABLE "SeoTagTile"
  ADD CONSTRAINT "SeoTagTile_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
