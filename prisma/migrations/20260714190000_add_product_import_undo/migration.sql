CREATE TABLE "ProductImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "createdCategories" JSONB,
    "createdBrands" JSONB,
    "completedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductImportEntry" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeSnapshot" JSONB,
    "afterUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImportEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductImportEntry_batchId_productId_key" ON "ProductImportEntry"("batchId", "productId");
CREATE INDEX "ProductImportBatch_status_completedAt_idx" ON "ProductImportBatch"("status", "completedAt");
CREATE INDEX "ProductImportBatch_createdAt_idx" ON "ProductImportBatch"("createdAt");
CREATE INDEX "ProductImportEntry_batchId_idx" ON "ProductImportEntry"("batchId");
CREATE INDEX "ProductImportEntry_productId_idx" ON "ProductImportEntry"("productId");

ALTER TABLE "ProductImportEntry"
ADD CONSTRAINT "ProductImportEntry_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "ProductImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
