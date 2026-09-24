ALTER TABLE "Customer" ADD COLUMN "externalCustomerId" TEXT;
ALTER TABLE "Product" ADD COLUMN "externalProductId" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN "externalVariantId" TEXT;

CREATE UNIQUE INDEX "Customer_tenantId_externalCustomerId_key"
  ON "Customer"("tenantId", "externalCustomerId");
CREATE UNIQUE INDEX "Product_tenantId_externalProductId_key"
  ON "Product"("tenantId", "externalProductId");
CREATE UNIQUE INDEX "ProductVariant_tenantId_externalVariantId_key"
  ON "ProductVariant"("tenantId", "externalVariantId");
