-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "comingSoon" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StaticPageContent" ALTER COLUMN "updatedAt" DROP DEFAULT;
