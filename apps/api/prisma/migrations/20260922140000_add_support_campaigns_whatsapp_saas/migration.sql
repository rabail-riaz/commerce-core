ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerScore" ADD COLUMN "manualClassification" TEXT;
ALTER TABLE "CustomerScore" ADD COLUMN "breakdown" JSONB;

CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'WAITING', 'RESOLVED', 'CLOSED');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "TemplateChannel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "AutomationStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');
CREATE TYPE "WhatsAppAccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED');

CREATE TABLE "CustomerNote" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerNote_tenantId_customerId_createdAt_idx" ON "CustomerNote"("tenantId", "customerId", "createdAt");
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT,
  "orderId" TEXT,
  "assigneeId" TEXT,
  "subject" TEXT NOT NULL,
  "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportTicket_tenantId_id_key" ON "SupportTicket"("tenantId", "id");
CREATE INDEX "SupportTicket_tenantId_status_createdAt_idx" ON "SupportTicket"("tenantId", "status", "createdAt");
CREATE INDEX "SupportTicket_tenantId_customerId_idx" ON "SupportTicket"("tenantId", "customerId");
CREATE INDEX "SupportTicket_tenantId_orderId_idx" ON "SupportTicket"("tenantId", "orderId");
CREATE INDEX "SupportTicket_tenantId_assigneeId_idx" ON "SupportTicket"("tenantId", "assigneeId");
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TicketMessage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketMessage_tenantId_ticketId_createdAt_idx" ON "TicketMessage"("tenantId", "ticketId", "createdAt");
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "SupportTicket"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MessageTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "TemplateChannel" NOT NULL,
  "provider" TEXT,
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageTemplate_tenantId_id_key" ON "MessageTemplate"("tenantId", "id");
CREATE UNIQUE INDEX "MessageTemplate_tenantId_name_channel_key" ON "MessageTemplate"("tenantId", "name", "channel");
CREATE INDEX "MessageTemplate_tenantId_channel_isActive_idx" ON "MessageTemplate"("tenantId", "channel", "isActive");
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" "TemplateChannel" NOT NULL,
  "templateId" TEXT,
  "audience" JSONB,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Campaign_tenantId_id_key" ON "Campaign"("tenantId", "id");
CREATE INDEX "Campaign_tenantId_status_createdAt_idx" ON "Campaign"("tenantId", "status", "createdAt");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_templateId_fkey" FOREIGN KEY ("tenantId", "templateId") REFERENCES "MessageTemplate"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CampaignExecution" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "status" "CampaignStatus" NOT NULL,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignExecution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CampaignExecution_tenantId_campaignId_createdAt_idx" ON "CampaignExecution"("tenantId", "campaignId", "createdAt");
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_tenantId_campaignId_fkey" FOREIGN KEY ("tenantId", "campaignId") REFERENCES "Campaign"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignExecution" ADD CONSTRAINT "CampaignExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Automation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "delayMinutes" INTEGER NOT NULL DEFAULT 0,
  "templateId" TEXT,
  "status" "AutomationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Automation_tenantId_id_key" ON "Automation"("tenantId", "id");
CREATE INDEX "Automation_tenantId_status_idx" ON "Automation"("tenantId", "status");
CREATE INDEX "Automation_tenantId_trigger_idx" ON "Automation"("tenantId", "trigger");
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AutomationExecution" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "entityId" TEXT,
  "status" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AutomationExecution_tenantId_automationId_createdAt_idx" ON "AutomationExecution"("tenantId", "automationId", "createdAt");
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_tenantId_automationId_fkey" FOREIGN KEY ("tenantId", "automationId") REFERENCES "Automation"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_tenantId_userId_status_createdAt_idx" ON "Notification"("tenantId", "userId", "status", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppAccount" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "phoneNumberId" TEXT NOT NULL,
  "businessAccountId" TEXT,
  "credentialsCiphertext" TEXT,
  "status" "WhatsAppAccountStatus" NOT NULL DEFAULT 'DISABLED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppAccount_tenantId_id_key" ON "WhatsAppAccount"("tenantId", "id");
CREATE UNIQUE INDEX "WhatsAppAccount_tenantId_phoneNumberId_key" ON "WhatsAppAccount"("tenantId", "phoneNumberId");
CREATE INDEX "WhatsAppAccount_tenantId_status_idx" ON "WhatsAppAccount"("tenantId", "status");
ALTER TABLE "WhatsAppAccount" ADD CONSTRAINT "WhatsAppAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppConversation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "customerId" TEXT,
  "orderId" TEXT,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppConversation_tenantId_id_key" ON "WhatsAppConversation"("tenantId", "id");
CREATE UNIQUE INDEX "WhatsAppConversation_tenantId_accountId_customerPhone_key" ON "WhatsAppConversation"("tenantId", "accountId", "customerPhone");
CREATE INDEX "WhatsAppConversation_tenantId_accountId_lastMessageAt_idx" ON "WhatsAppConversation"("tenantId", "accountId", "lastMessageAt");
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "WhatsAppAccount"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppMessage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "direction" "EmailMessageDirection" NOT NULL,
  "body" TEXT NOT NULL,
  "templateName" TEXT,
  "status" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppMessage_tenantId_id_key" ON "WhatsAppMessage"("tenantId", "id");
CREATE UNIQUE INDEX "WhatsAppMessage_tenantId_accountId_providerMessageId_key" ON "WhatsAppMessage"("tenantId", "accountId", "providerMessageId");
CREATE INDEX "WhatsAppMessage_tenantId_conversationId_createdAt_idx" ON "WhatsAppMessage"("tenantId", "conversationId", "createdAt");
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "WhatsAppAccount"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "WhatsAppConversation"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Plan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "maxStores" INTEGER NOT NULL DEFAULT 1,
  "maxUsers" INTEGER NOT NULL DEFAULT 5,
  "maxOrdersPerMonth" INTEGER NOT NULL DEFAULT 500,
  "maxCustomers" INTEGER NOT NULL DEFAULT 1000,
  "maxWhatsAppMessages" INTEGER NOT NULL DEFAULT 500,
  "maxEmailVolume" INTEGER NOT NULL DEFAULT 500,
  "maxCouriers" INTEGER NOT NULL DEFAULT 2,
  "maxAutomations" INTEGER NOT NULL DEFAULT 3,
  "maxReports" INTEGER NOT NULL DEFAULT 5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

CREATE TABLE "TenantSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
  "trialStartsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "TenantSubscription"("tenantId");
CREATE INDEX "TenantSubscription_status_trialEndsAt_idx" ON "TenantSubscription"("status", "trialEndsAt");
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "tenantId" TEXT,
  "planId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeatureFlag_key_tenantId_planId_key" ON "FeatureFlag"("key", "tenantId", "planId");
CREATE INDEX "FeatureFlag_key_enabled_idx" ON "FeatureFlag"("key", "enabled");
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Plan" ("id", "name", "updatedAt") VALUES ('plan_trial', 'Trial', CURRENT_TIMESTAMP);
INSERT INTO "FeatureFlag" ("id", "key", "enabled", "updatedAt") VALUES
  ('flag_ai', 'AI_ASSISTANT', false, CURRENT_TIMESTAMP),
  ('flag_shopify', 'SHOPIFY_INTEGRATION', false, CURRENT_TIMESTAMP),
  ('flag_campaigns', 'CAMPAIGNS', true, CURRENT_TIMESTAMP),
  ('flag_automations', 'AUTOMATIONS', true, CURRENT_TIMESTAMP),
  ('flag_reports', 'ADVANCED_REPORTS', true, CURRENT_TIMESTAMP);
INSERT INTO "TenantSubscription" ("id", "tenantId", "planId", "status", "trialStartsAt", "trialEndsAt", "createdAt", "updatedAt")
SELECT 'sub_' || "id", "id", 'plan_trial', 'TRIAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '15 days', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant"
ON CONFLICT ("tenantId") DO NOTHING;
