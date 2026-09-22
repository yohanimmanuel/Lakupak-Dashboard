CREATE TABLE IF NOT EXISTS "PlatformAdminInboxState" (
  "id" SERIAL NOT NULL,
  "adminId" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "readAt" TIMESTAMPTZ(3),
  "dismissedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PlatformAdminInboxState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformAdminInboxState_adminId_source_userId_key"
  ON "PlatformAdminInboxState"("adminId", "source", "userId");
CREATE INDEX IF NOT EXISTS "PlatformAdminInboxState_adminId_idx"
  ON "PlatformAdminInboxState"("adminId");

ALTER TABLE "PlatformAdminInboxState"
  ADD CONSTRAINT "PlatformAdminInboxState_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
