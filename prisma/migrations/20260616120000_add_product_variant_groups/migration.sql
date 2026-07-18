CREATE TABLE "ProductVariantGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariantGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product"
    ADD COLUMN "variantGroupId" TEXT,
    ADD COLUMN "variantColor" TEXT,
    ADD COLUMN "variantMemory" TEXT,
    ADD COLUMN "variantSim" TEXT;

CREATE INDEX "ProductVariantGroup_name_idx" ON "ProductVariantGroup"("name");
CREATE INDEX "Product_variantGroupId_idx" ON "Product"("variantGroupId");
CREATE INDEX "Product_variantColor_variantMemory_variantSim_idx" ON "Product"("variantColor", "variantMemory", "variantSim");

ALTER TABLE "Product"
    ADD CONSTRAINT "Product_variantGroupId_fkey"
    FOREIGN KEY ("variantGroupId")
    REFERENCES "ProductVariantGroup"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
