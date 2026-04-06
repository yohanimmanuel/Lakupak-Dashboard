-- Add PlatformAdmin + PlatformAnnouncement schemas.

CREATE TABLE "PlatformAdmin" (
  "id" SERIAL NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

CREATE TABLE "PlatformAnnouncement" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'update',
  "imageUrl" TEXT,
  "linkUrl" TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdByAdminId" INTEGER,

  CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAnnouncement_isPublished_publishedAt_idx" ON "PlatformAnnouncement"("isPublished", "publishedAt");
CREATE INDEX "PlatformAnnouncement_category_idx" ON "PlatformAnnouncement"("category");

ALTER TABLE "PlatformAnnouncement"
ADD CONSTRAINT "PlatformAnnouncement_createdByAdminId_fkey"
FOREIGN KEY ("createdByAdminId") REFERENCES "PlatformAdmin"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable RLS (defense-in-depth). App layer enforces real auth.
ALTER TABLE "PlatformAdmin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAnnouncement" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application can manage platform admins"
  ON "PlatformAdmin" FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Application can manage platform announcements"
  ON "PlatformAnnouncement" FOR ALL
  USING (true)
  WITH CHECK (true);

