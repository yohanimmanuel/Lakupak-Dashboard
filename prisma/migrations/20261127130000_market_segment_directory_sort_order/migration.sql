ALTER TABLE "MarketSegmentDirectory" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (
           PARTITION BY "userId"
           ORDER BY "mainChannel" ASC, "subChannel" ASC, id ASC
         ) - 1) AS ord
  FROM "MarketSegmentDirectory"
)
UPDATE "MarketSegmentDirectory" AS directory
SET "sortOrder" = ranked.ord
FROM ranked
WHERE directory.id = ranked.id;
