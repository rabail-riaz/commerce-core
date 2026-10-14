-- RenameForeignKey
ALTER TABLE "IntegrationCredential" RENAME CONSTRAINT "IntegrationCredential_integration_fkey" TO "IntegrationCredential_tenantId_integrationId_fkey";

-- RenameForeignKey
ALTER TABLE "IntegrationSyncLog" RENAME CONSTRAINT "IntegrationSyncLog_integration_fkey" TO "IntegrationSyncLog_tenantId_integrationId_fkey";

-- RenameForeignKey
ALTER TABLE "WebhookEvent" RENAME CONSTRAINT "WebhookEvent_integration_fkey" TO "WebhookEvent_tenantId_integrationId_fkey";
