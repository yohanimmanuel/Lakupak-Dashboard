-- Track whether a history supply row already applied stock (prevents re-apply on re-check).
ALTER TABLE "SupplyRecord" ADD COLUMN IF NOT EXISTS "stockApplied" BOOLEAN NOT NULL DEFAULT false;

-- Existing history rows already counted toward catalog stock; do not re-apply on re-check.
UPDATE "SupplyRecord"
SET "stockApplied" = true
WHERE "recordType" = 'history';