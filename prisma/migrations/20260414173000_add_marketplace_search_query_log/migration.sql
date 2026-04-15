-- Add MarketplaceSearchQueryLog table to capture real user queries

CREATE TABLE IF NOT EXISTS "public"."MarketplaceSearchQueryLog" (
  "id" SERIAL PRIMARY KEY,
  "marketplaceUserId" INTEGER NULL,
  "query" TEXT NOT NULL,
  "category" TEXT NULL,
  "page" INTEGER NULL,
  "limit" INTEGER NULL,
  "resultCount" INTEGER NOT NULL,
  "engine" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "MarketplaceSearchQueryLog_createdAt_idx"
  ON "public"."MarketplaceSearchQueryLog" ("createdAt");

CREATE INDEX IF NOT EXISTS "MarketplaceSearchQueryLog_query_createdAt_idx"
  ON "public"."MarketplaceSearchQueryLog" ("query", "createdAt");

CREATE INDEX IF NOT EXISTS "MarketplaceSearchQueryLog_engine_createdAt_idx"
  ON "public"."MarketplaceSearchQueryLog" ("engine", "createdAt");

