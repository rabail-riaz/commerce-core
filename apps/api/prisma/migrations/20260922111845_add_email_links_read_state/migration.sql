-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "ticketId" TEXT,
ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "EmailMessage_tenantId_threadId_isRead_idx" ON "EmailMessage"("tenantId", "threadId", "isRead");

-- CreateIndex
CREATE INDEX "EmailThread_tenantId_customerId_idx" ON "EmailThread"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "EmailThread_tenantId_orderId_idx" ON "EmailThread"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "EmailThread_tenantId_ticketId_idx" ON "EmailThread"("tenantId", "ticketId");

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
