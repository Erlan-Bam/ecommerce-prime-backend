-- Add SEO fields to catalog entities
ALTER TABLE "public"."Category"
ADD COLUMN "seoTitle" TEXT,
ADD COLUMN "seoDescription" TEXT,
ADD COLUMN "seoH1" TEXT;

ALTER TABLE "public"."Product"
ADD COLUMN "seoTitle" TEXT,
ADD COLUMN "seoDescription" TEXT,
ADD COLUMN "seoH1" TEXT;

-- Page-type templates for frontend metadata/H1 fallback logic
CREATE TYPE "public"."SeoPageType" AS ENUM ('HOME', 'CATEGORY', 'PRODUCT', 'STATIC', 'BLOG');

CREATE TABLE "public"."SeoTemplate" (
    "id" TEXT NOT NULL,
    "type" "public"."SeoPageType" NOT NULL,
    "titleTemplate" TEXT,
    "descriptionTemplate" TEXT,
    "h1Template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeoTemplate_type_key" ON "public"."SeoTemplate"("type");

-- Static/non-catalog page SEO overrides
CREATE TABLE "public"."StaticPageSeo" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoH1" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaticPageSeo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaticPageSeo_path_key" ON "public"."StaticPageSeo"("path");
CREATE INDEX "StaticPageSeo_path_idx" ON "public"."StaticPageSeo"("path");
CREATE INDEX "StaticPageSeo_isActive_idx" ON "public"."StaticPageSeo"("isActive");
