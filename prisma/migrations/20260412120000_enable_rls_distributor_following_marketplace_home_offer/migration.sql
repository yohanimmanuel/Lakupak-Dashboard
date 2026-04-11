-- RLS for DistributorFollowing (buyer → distributor follows) and MarketplaceHomeOffer (home “Special Offers” banners).
-- Defense-in-depth: API routes enforce auth; Prisma service role bypasses RLS when configured.
-- Wrapped in DO blocks so shadow-database replay is safe if order differs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'DistributorFollowing'
  ) THEN
    ALTER TABLE "DistributorFollowing" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'DistributorFollowing'
        AND policyname = 'Application can manage distributor followings'
    ) THEN
      CREATE POLICY "Application can manage distributor followings"
        ON "DistributorFollowing" FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'MarketplaceHomeOffer'
  ) THEN
    ALTER TABLE "MarketplaceHomeOffer" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'MarketplaceHomeOffer'
        AND policyname = 'Application can manage marketplace home offers'
    ) THEN
      CREATE POLICY "Application can manage marketplace home offers"
        ON "MarketplaceHomeOffer" FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;
