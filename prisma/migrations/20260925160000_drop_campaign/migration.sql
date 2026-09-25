-- Removed with campaigns. The column was added by 20260817120000_add_workflow_schedule_claim_key,
-- which exists on the live database but not in this folder. Claims are stored in workflow JSON.
ALTER TABLE "AutomationWorkflow" DROP COLUMN IF EXISTS "scheduleClaimKey";

-- Campaigns are no longer part of the product. Existing rows are removed with the table.
DROP TABLE IF EXISTS "Campaign";
