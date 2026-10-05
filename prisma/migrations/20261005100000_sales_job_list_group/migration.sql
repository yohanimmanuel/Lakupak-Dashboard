ALTER TABLE "SalesJob" ADD COLUMN IF NOT EXISTS "listGroupId" TEXT;

UPDATE "SalesJob" AS job
SET "listGroupId" = grouped.anchor
FROM (
  SELECT "assignedTo", COALESCE("clientId", '') AS client_key, MIN(id) AS anchor
  FROM "SalesJob"
  GROUP BY "assignedTo", COALESCE("clientId", '')
) AS grouped
WHERE job."listGroupId" IS NULL
  AND job."assignedTo" = grouped."assignedTo"
  AND COALESCE(job."clientId", '') = grouped.client_key;

CREATE INDEX IF NOT EXISTS "SalesJob_listGroupId_idx" ON "SalesJob"("listGroupId");
