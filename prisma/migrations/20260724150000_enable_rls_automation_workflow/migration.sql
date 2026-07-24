-- Enable RLS on automation workflow tables (defense-in-depth; GraphQL enforces userId).
-- Wrapped in DO blocks so shadow-database replay is safe if table order differs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'AutomationWorkflow'
  ) THEN
    ALTER TABLE "AutomationWorkflow" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'AutomationWorkflow'
        AND policyname = 'Users can manage own automation workflows'
    ) THEN
      CREATE POLICY "Users can manage own automation workflows"
        ON "AutomationWorkflow" FOR ALL
        USING ("userId" IS NOT NULL)
        WITH CHECK ("userId" IS NOT NULL);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'AutomationRun'
  ) THEN
    ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'AutomationRun'
        AND policyname = 'Users can manage runs of own automation workflows'
    ) THEN
      CREATE POLICY "Users can manage runs of own automation workflows"
        ON "AutomationRun" FOR ALL
        USING (
          "workflowId" IN (
            SELECT "id" FROM "AutomationWorkflow" WHERE "userId" IS NOT NULL
          )
        )
        WITH CHECK (
          "workflowId" IN (
            SELECT "id" FROM "AutomationWorkflow" WHERE "userId" IS NOT NULL
          )
        );
    END IF;
  END IF;
END $$;
