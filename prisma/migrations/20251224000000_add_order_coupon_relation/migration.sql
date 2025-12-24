-- AlterTable: Add discount, finalTotal columns and couponId foreign key to Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "finalTotal" DECIMAL(10,2);

-- Update existing orders to set finalTotal = total where null
UPDATE "Order" SET "finalTotal" = "total" WHERE "finalTotal" IS NULL;

-- Make finalTotal NOT NULL after setting default values
ALTER TABLE "Order" ALTER COLUMN "finalTotal" SET NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_couponId_idx" ON "Order"("couponId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
