ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_id_key" UNIQUE ("tenantId", "id");
