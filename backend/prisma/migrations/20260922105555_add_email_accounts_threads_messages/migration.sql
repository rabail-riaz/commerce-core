-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'MICROSOFT365', 'SMTP');

-- CreateEnum
CREATE TYPE "EmailAccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "EmailMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "provider" "EmailProvider" NOT NULL,
    "credentialsReference" TEXT,
    "credentialsCiphertext" TEXT,
    "status" "EmailAccountStatus" NOT NULL DEFAULT 'DISABLED',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "canSend" BOOLEAN NOT NULL DEFAULT false,
    "canReceive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "subject" TEXT,
    "participants" JSONB,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "direction" "EmailMessageDirection" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" JSONB NOT NULL,
    "ccAddresses" JSONB,
    "bccAddresses" JSONB,
    "subject" TEXT,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailAccount_tenantId_provider_idx" ON "EmailAccount"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "EmailAccount_tenantId_status_idx" ON "EmailAccount"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_tenantId_id_key" ON "EmailAccount"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_tenantId_emailAddress_key" ON "EmailAccount"("tenantId", "emailAddress");

-- CreateIndex
CREATE INDEX "EmailThread_tenantId_emailAccountId_lastMessageAt_idx" ON "EmailThread"("tenantId", "emailAccountId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_tenantId_id_key" ON "EmailThread"("tenantId", "id");

-- CreateIndex
CREATE INDEX "EmailMessage_tenantId_threadId_createdAt_idx" ON "EmailMessage"("tenantId", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_tenantId_emailAccountId_sentAt_idx" ON "EmailMessage"("tenantId", "emailAccountId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_tenantId_id_key" ON "EmailMessage"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_tenantId_emailAccountId_providerMessageId_key" ON "EmailMessage"("tenantId", "emailAccountId", "providerMessageId");

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_tenantId_emailAccountId_fkey" FOREIGN KEY ("tenantId", "emailAccountId") REFERENCES "EmailAccount"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_tenantId_emailAccountId_fkey" FOREIGN KEY ("tenantId", "emailAccountId") REFERENCES "EmailAccount"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_tenantId_threadId_fkey" FOREIGN KEY ("tenantId", "threadId") REFERENCES "EmailThread"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
