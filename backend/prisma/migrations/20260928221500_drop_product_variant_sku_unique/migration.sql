-- WooCommerce variants often reuse a SKU or leave it blank. Identity is externalVariantId.
UPDATE "ProductVariant" SET sku = NULL WHERE sku IS NOT NULL AND btrim(sku) = '';
DROP INDEX IF EXISTS "ProductVariant_tenantId_sku_key";
