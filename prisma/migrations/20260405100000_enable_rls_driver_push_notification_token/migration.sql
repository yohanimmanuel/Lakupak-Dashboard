-- RLS for DriverPushNotificationToken (Laku-Driver Expo push tokens).
-- Tokens are only valid when tied to a Driver row owned by a distributor (userId set).
-- Application auth still enforces which driver/user can read/write; this is defense in depth.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'DriverPushNotificationToken'
  ) THEN
    ALTER TABLE "DriverPushNotificationToken" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'DriverPushNotificationToken'
        AND policyname = 'Users can manage driver push tokens for linked drivers'
    ) THEN
      CREATE POLICY "Users can manage driver push tokens for linked drivers"
        ON "DriverPushNotificationToken" FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM "Driver" d
            WHERE d.id = "DriverPushNotificationToken"."driverId"
              AND d."userId" IS NOT NULL
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM "Driver" d
            WHERE d.id = "DriverPushNotificationToken"."driverId"
              AND d."userId" IS NOT NULL
          )
        );
    END IF;
  END IF;
END $$;
