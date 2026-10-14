-- Supports tenant-scoped calendar-period dashboard aggregates.
CREATE INDEX "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");
