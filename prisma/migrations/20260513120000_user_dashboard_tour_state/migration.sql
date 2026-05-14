-- Optional: dashboard walkthrough progress (JSON blob). Safe if column already exists.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dashboardTourState" JSONB;
