-- Enable RLS on OrderFailedReason table (driver-reported delivery failures)
-- Wrapped in DO block so shadow-database replay does not fail when this migration
-- runs before the table-creation migration (20260312135901_add_orderfailedreasons_schema).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'OrderFailedReason'
  ) THEN
    ALTER TABLE "OrderFailedReason" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename  = 'OrderFailedReason'
        AND policyname = 'Application can manage order failed reasons'
    ) THEN
      CREATE POLICY "Application can manage order failed reasons"
        ON "OrderFailedReason" FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;
