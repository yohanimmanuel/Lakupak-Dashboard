-- AlterTable
ALTER TABLE "AutomationRun" ADD COLUMN "runKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRun_workflowId_runKey_key" ON "AutomationRun"("workflowId", "runKey");
