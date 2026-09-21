-- KYC document URLs on Company, pending account status on User, email verification tokens.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountStatus" TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS "User_accountStatus_idx" ON "User"("accountStatus");

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "nibDocumentUrl" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "nibDocumentName" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "nibDocumentPublicId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "npwpDocumentUrl" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "npwpDocumentName" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "npwpDocumentPublicId" TEXT;

CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_idx" ON "EmailVerificationToken"("tokenHash");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailVerificationToken_userId_fkey'
  ) THEN
    ALTER TABLE "EmailVerificationToken"
      ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
