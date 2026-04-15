-- Add MarketplaceSearchSynonym table for Meilisearch synonyms management

CREATE TABLE IF NOT EXISTS "public"."MarketplaceSearchSynonym" (
  "id" SERIAL PRIMARY KEY,
  "indexUid" TEXT NOT NULL DEFAULT 'marketplace_products',
  "term" TEXT NOT NULL,
  "synonyms" TEXT[] NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);

-- Unique per index + term
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MarketplaceSearchSynonym_indexUid_term_key'
  ) THEN
    ALTER TABLE "public"."MarketplaceSearchSynonym"
      ADD CONSTRAINT "MarketplaceSearchSynonym_indexUid_term_key" UNIQUE ("indexUid", "term");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MarketplaceSearchSynonym_indexUid_idx"
  ON "public"."MarketplaceSearchSynonym" ("indexUid");

CREATE INDEX IF NOT EXISTS "MarketplaceSearchSynonym_enabled_idx"
  ON "public"."MarketplaceSearchSynonym" ("enabled");

