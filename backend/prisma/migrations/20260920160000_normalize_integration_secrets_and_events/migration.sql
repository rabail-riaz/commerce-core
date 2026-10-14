-- Normalize integration credentials and retain tenant-scoped sync/webhook history.
CREATE TYPE "IntegrationSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "Integration"
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT;

CREATE UNIQUE INDEX "Integration_tenantId_id_key" ON "Integration"("tenantId", "id");

CREATE TABLE "IntegrationCredential" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationCredential_tenantId_integrationId_key" ON "IntegrationCredential"("tenantId", "integrationId");
CREATE INDEX "IntegrationCredential_tenantId_idx" ON "IntegrationCredential"("tenantId");
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_integration_fkey"
  FOREIGN KEY ("tenantId", "integrationId") REFERENCES "Integration"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "IntegrationCredential" ("id", "tenantId", "integrationId", "ciphertext", "keyVersion", "createdAt", "updatedAt")
SELECT "id" || '-credential', "tenantId", "id", "credentialsCiphertext", 1, "createdAt", CURRENT_TIMESTAMP
FROM "Integration"
WHERE "credentialsCiphertext" IS NOT NULL;

ALTER TABLE "Integration" DROP COLUMN "credentialsCiphertext";

CREATE TABLE "IntegrationSyncLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "status" "IntegrationSyncStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "recordsSynced" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  CONSTRAINT "IntegrationSyncLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntegrationSyncLog_tenantId_integrationId_startedAt_idx" ON "IntegrationSyncLog"("tenantId", "integrationId", "startedAt");
CREATE INDEX "IntegrationSyncLog_tenantId_status_idx" ON "IntegrationSyncLog"("tenantId", "status");
ALTER TABLE "IntegrationSyncLog" ADD CONSTRAINT "IntegrationSyncLog_integration_fkey"
  FOREIGN KEY ("tenantId", "integrationId") REFERENCES "Integration"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "integrationId" TEXT,
  "provider" TEXT NOT NULL,
  "externalId" TEXT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookEvent_tenantId_provider_externalId_key" ON "WebhookEvent"("tenantId", "provider", "externalId");
CREATE INDEX "WebhookEvent_tenantId_integrationId_receivedAt_idx" ON "WebhookEvent"("tenantId", "integrationId", "receivedAt");
CREATE INDEX "WebhookEvent_tenantId_eventType_receivedAt_idx" ON "WebhookEvent"("tenantId", "eventType", "receivedAt");
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_integration_fkey"
  FOREIGN KEY ("tenantId", "integrationId") REFERENCES "Integration"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
