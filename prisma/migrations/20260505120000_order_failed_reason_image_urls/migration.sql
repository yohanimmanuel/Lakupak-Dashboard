-- AlterTable (safe if column already applied manually / synced from schema)
ALTER TABLE "OrderFailedReason" ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
