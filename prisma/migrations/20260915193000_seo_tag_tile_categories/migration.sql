CREATE TABLE "SeoTagTileCategory" (
    "tagTileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "SeoTagTileCategory_pkey" PRIMARY KEY ("tagTileId","categoryId")
);

CREATE INDEX "SeoTagTileCategory_categoryId_idx"
ON "SeoTagTileCategory"("categoryId");

ALTER TABLE "SeoTagTileCategory"
ADD CONSTRAINT "SeoTagTileCategory_tagTileId_fkey"
FOREIGN KEY ("tagTileId") REFERENCES "SeoTagTile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeoTagTileCategory"
ADD CONSTRAINT "SeoTagTileCategory_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve every existing single-category assignment.
INSERT INTO "SeoTagTileCategory" ("tagTileId", "categoryId")
SELECT "id", "categoryId"
FROM "SeoTagTile"
WHERE "categoryId" IS NOT NULL
ON CONFLICT DO NOTHING;
