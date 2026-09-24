-- AlterTable
ALTER TABLE "AutomationExecution" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "scheduledAt" TIMESTAMP(3);
