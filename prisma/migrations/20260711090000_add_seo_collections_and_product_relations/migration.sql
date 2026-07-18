CREATE TABLE "RobotsSettings" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotsSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SeoCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT,
    "brandIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "minPrice" DECIMAL(10,2),
    "maxPrice" DECIMAL(10,2),
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "isOnSale" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB,
    "sortBy" TEXT,
    "description" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoH1" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoCollection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoCollection_slug_key" ON "SeoCollection"("slug");
CREATE INDEX "SeoCollection_categoryId_idx" ON "SeoCollection"("categoryId");
CREATE INDEX "SeoCollection_isActive_sortOrder_idx" ON "SeoCollection"("isActive", "sortOrder");

CREATE TABLE "SeoTagTile" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "collectionId" TEXT,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoTagTile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SeoTagTile_collectionId_idx" ON "SeoTagTile"("collectionId");
CREATE INDEX "SeoTagTile_isActive_sortOrder_idx" ON "SeoTagTile"("isActive", "sortOrder");

CREATE TABLE "ProductRelation" (
    "id" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "targetProductId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductRelation_sourceProductId_targetProductId_key" ON "ProductRelation"("sourceProductId", "targetProductId");
CREATE INDEX "ProductRelation_sourceProductId_sortOrder_idx" ON "ProductRelation"("sourceProductId", "sortOrder");
CREATE INDEX "ProductRelation_targetProductId_idx" ON "ProductRelation"("targetProductId");

ALTER TABLE "SeoCollection"
  ADD CONSTRAINT "SeoCollection_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SeoTagTile"
  ADD CONSTRAINT "SeoTagTile_collectionId_fkey"
  FOREIGN KEY ("collectionId") REFERENCES "SeoCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductRelation"
  ADD CONSTRAINT "ProductRelation_sourceProductId_fkey"
  FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductRelation"
  ADD CONSTRAINT "ProductRelation_targetProductId_fkey"
  FOREIGN KEY ("targetProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
