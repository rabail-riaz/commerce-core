ALTER TABLE "CourierAccount" ADD COLUMN "webhookToken" TEXT; CREATE UNIQUE INDEX "CourierAccount_webhookToken_key" ON "CourierAccount"("webhookToken");
