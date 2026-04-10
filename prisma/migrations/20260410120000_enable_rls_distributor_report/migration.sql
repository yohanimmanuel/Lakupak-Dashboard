-- RLS for DistributorReport (buyer reports against dashboard distributors).
-- Defense-in-depth: app routes enforce auth; Prisma service role bypasses RLS when configured.
-- Wrapped in DO block so shadow-database replay is safe if order differs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'DistributorReport'
  ) THEN
    ALTER TABLE "DistributorReport" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'DistributorReport'
        AND policyname = 'Application can manage distributor reports'
    ) THEN
      CREATE POLICY "Application can manage distributor reports"
        ON "DistributorReport" FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;
