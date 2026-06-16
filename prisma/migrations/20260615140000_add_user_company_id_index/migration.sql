-- Index for User.companyId FK lookups (FK constraint already exists from baseline).
CREATE INDEX IF NOT EXISTS "User_companyId_idx" ON "User"("companyId");
