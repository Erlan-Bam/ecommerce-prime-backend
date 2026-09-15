-- PE-07 / PE-08 / PE-09: blog scheduling, authors and product blocks
-- Additive migration. Existing blog content and legacy author strings are preserved.

CREATE TYPE "BlogProductPlacement" AS ENUM ('AFTER_ARTICLE', 'INLINE');

CREATE TABLE "BlogAuthor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogAuthor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogAuthor_name_key" ON "BlogAuthor"("name");
CREATE INDEX "BlogAuthor_isActive_name_idx" ON "BlogAuthor"("isActive", "name");

ALTER TABLE "Blog" ADD COLUMN "authorId" TEXT;
ALTER TABLE "Blog" ADD COLUMN "publishedAt" TIMESTAMP(3);
UPDATE "Blog" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;
ALTER TABLE "Blog" ALTER COLUMN "publishedAt" SET NOT NULL;
ALTER TABLE "Blog" ALTER COLUMN "publishedAt" SET DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "BlogAuthor" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT 'legacy-' || md5(author_name), author_name, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT COALESCE(NULLIF(BTRIM("author"), ''), 'Редакция Prime') AS author_name FROM "Blog") AS legacy_authors
ON CONFLICT ("name") DO NOTHING;

UPDATE "Blog" AS b SET "authorId" = a."id"
FROM "BlogAuthor" AS a
WHERE a."name" = COALESCE(NULLIF(BTRIM(b."author"), ''), 'Редакция Prime');

CREATE INDEX "Blog_publishedAt_idx" ON "Blog"("publishedAt");
CREATE INDEX "Blog_isActive_publishedAt_idx" ON "Blog"("isActive", "publishedAt");
CREATE INDEX "Blog_authorId_idx" ON "Blog"("authorId");
ALTER TABLE "Blog" ADD CONSTRAINT "Blog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "BlogAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BlogProductBlock" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "title" TEXT,
    "placement" "BlogProductPlacement" NOT NULL DEFAULT 'AFTER_ARTICLE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogProductBlock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BlogProductBlockItem" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlogProductBlockItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BlogProductBlock_blogId_placement_sortOrder_idx" ON "BlogProductBlock"("blogId", "placement", "sortOrder");
CREATE UNIQUE INDEX "BlogProductBlockItem_blockId_productId_key" ON "BlogProductBlockItem"("blockId", "productId");
CREATE INDEX "BlogProductBlockItem_blockId_sortOrder_idx" ON "BlogProductBlockItem"("blockId", "sortOrder");
CREATE INDEX "BlogProductBlockItem_productId_idx" ON "BlogProductBlockItem"("productId");
ALTER TABLE "BlogProductBlock" ADD CONSTRAINT "BlogProductBlock_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogProductBlockItem" ADD CONSTRAINT "BlogProductBlockItem_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "BlogProductBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogProductBlockItem" ADD CONSTRAINT "BlogProductBlockItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
