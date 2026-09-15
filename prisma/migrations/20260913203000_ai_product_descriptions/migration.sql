-- PE-13 MVP: GenAPI product description drafts and batch processing.
-- Additive only: existing Product.description values are not changed by migration.

CREATE TABLE "AiDescriptionSettings" (
    "id" TEXT NOT NULL,
    "encryptedApiKey" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiDescriptionSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiDescriptionBatch" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "success" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AiDescriptionBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiDescriptionDraft" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    CONSTRAINT "AiDescriptionDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiDescriptionDraft_productId_key" ON "AiDescriptionDraft"("productId");
CREATE INDEX "AiDescriptionDraft_status_updatedAt_idx" ON "AiDescriptionDraft"("status", "updatedAt");
CREATE INDEX "AiDescriptionDraft_batchId_idx" ON "AiDescriptionDraft"("batchId");
CREATE INDEX "AiDescriptionBatch_status_createdAt_idx" ON "AiDescriptionBatch"("status", "createdAt");

ALTER TABLE "AiDescriptionDraft" ADD CONSTRAINT "AiDescriptionDraft_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiDescriptionDraft" ADD CONSTRAINT "AiDescriptionDraft_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "AiDescriptionBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AiDescriptionSettings" ("id", "model") VALUES ('default', 'gpt-4.1')
ON CONFLICT ("id") DO NOTHING;
