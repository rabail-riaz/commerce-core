-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "emailThreadId" TEXT,
ADD COLUMN     "whatsappConversationId" TEXT;

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_emailThreadId_idx" ON "SupportTicket"("tenantId", "emailThreadId");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_whatsappConversationId_idx" ON "SupportTicket"("tenantId", "whatsappConversationId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_emailThreadId_fkey" FOREIGN KEY ("tenantId", "emailThreadId") REFERENCES "EmailThread"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_whatsappConversationId_fkey" FOREIGN KEY ("tenantId", "whatsappConversationId") REFERENCES "WhatsAppConversation"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
