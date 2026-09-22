CREATE TABLE IF NOT EXISTS "GoogleRegisterProof" (
  "id" SERIAL NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleRegisterProof_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GoogleRegisterProof_tokenHash_key" ON "GoogleRegisterProof"("tokenHash");
CREATE INDEX IF NOT EXISTS "GoogleRegisterProof_email_idx" ON "GoogleRegisterProof"("email");
CREATE INDEX IF NOT EXISTS "GoogleRegisterProof_expiresAt_idx" ON "GoogleRegisterProof"("expiresAt");
