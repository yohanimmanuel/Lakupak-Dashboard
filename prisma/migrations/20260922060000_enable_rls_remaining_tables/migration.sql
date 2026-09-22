-- Enable RLS on tables added after the last remaining-tables pass.
-- Defense-in-depth only: API routes enforce real authorization.
-- Service role (Prisma) bypasses RLS.

-- ============================================================================
-- EMAIL VERIFICATION TOKEN (hashed token + expiry; API create/verify/delete)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'EmailVerificationToken'
  ) THEN
    ALTER TABLE "EmailVerificationToken" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'EmailVerificationToken'
        AND policyname = 'Allow email verification token operations'
    ) THEN
      CREATE POLICY "Allow email verification token operations"
        ON "EmailVerificationToken" FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- KYC RESUBMIT TOKEN (hashed token + expiry; API create/verify/delete)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'KycResubmitToken'
  ) THEN
    ALTER TABLE "KycResubmitToken" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'KycResubmitToken'
        AND policyname = 'Allow kyc resubmit token operations'
    ) THEN
      CREATE POLICY "Allow kyc resubmit token operations"
        ON "KycResubmitToken" FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- GOOGLE REGISTER PROOF (short-lived OAuth resume token; API consume)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'GoogleRegisterProof'
  ) THEN
    ALTER TABLE "GoogleRegisterProof" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'GoogleRegisterProof'
        AND policyname = 'Allow google register proof operations'
    ) THEN
      CREATE POLICY "Allow google register proof operations"
        ON "GoogleRegisterProof" FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PLATFORM ADMIN INBOX STATE (per-admin registration read/dismiss)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'PlatformAdminInboxState'
  ) THEN
    ALTER TABLE "PlatformAdminInboxState" ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'PlatformAdminInboxState'
        AND policyname = 'Application can manage platform admin inbox state'
    ) THEN
      CREATE POLICY "Application can manage platform admin inbox state"
        ON "PlatformAdminInboxState" FOR ALL
        USING ("adminId" IS NOT NULL)
        WITH CHECK ("adminId" IS NOT NULL);
    END IF;
  END IF;
END $$;
