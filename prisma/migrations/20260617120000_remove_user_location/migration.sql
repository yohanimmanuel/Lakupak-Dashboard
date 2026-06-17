-- Drop redundant user profile location (business address lives on Company)
ALTER TABLE "User" DROP COLUMN IF EXISTS "location";
