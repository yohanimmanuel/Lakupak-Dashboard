CREATE TABLE IF NOT EXISTS "KycResubmitToken" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KycResubmitToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KycResubmitToken_userId_idx" ON "KycResubmitToken"("userId");
CREATE INDEX IF NOT EXISTS "KycResubmitToken_expiresAt_idx" ON "KycResubmitToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "KycResubmitToken_tokenHash_idx" ON "KycResubmitToken"("tokenHash");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KycResubmitToken_userId_fkey'
  ) THEN
    ALTER TABLE "KycResubmitToken"
      ADD CONSTRAINT "KycResubmitToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
