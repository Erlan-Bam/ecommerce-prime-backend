-- AlterTable
ALTER TABLE "public"."Order"
ADD COLUMN "bonusAccrualScheduledAt" TIMESTAMP(3),
ADD COLUMN "bonusAccrualAvailableAt" TIMESTAMP(3),
ADD COLUMN "bonusAccruedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_bonusAccrualAvailableAt_bonusAccruedAt_idx" ON "public"."Order"("bonusAccrualAvailableAt", "bonusAccruedAt");
