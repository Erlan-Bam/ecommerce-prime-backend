ALTER TABLE "OrderItem"
ADD COLUMN "unitPrice" DECIMAL(10, 2),
ADD COLUMN "variantKey" TEXT,
ADD COLUMN "variantLabel" TEXT;

UPDATE "OrderItem"
SET "unitPrice" = CASE
  WHEN "quantity" > 0 THEN "price" / "quantity"
  ELSE "price"
END
WHERE "unitPrice" IS NULL;

CREATE INDEX "OrderItem_variantKey_idx" ON "OrderItem"("variantKey");
