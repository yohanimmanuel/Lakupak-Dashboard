-- CreateEnum
CREATE TYPE "AppName" AS ENUM ('DASHBOARD', 'MARKETPLACE', 'DRIVER');

-- CreateEnum
CREATE TYPE "AppActorType" AS ENUM ('DASHBOARD_USER', 'MARKETPLACE_USER', 'DRIVER');

-- CreateTable
CREATE TABLE "AppSessionSample" (
    "id" TEXT NOT NULL,
    "app" "AppName" NOT NULL,
    "actorType" "AppActorType" NOT NULL,
    "actorId" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3) NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSessionSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppSessionSample_app_startedAt_idx" ON "AppSessionSample"("app", "startedAt");

-- CreateIndex
CREATE INDEX "AppSessionSample_actorType_actorId_startedAt_idx" ON "AppSessionSample"("actorType", "actorId", "startedAt");

-- CreateIndex
CREATE INDEX "AppSessionSample_createdAt_idx" ON "AppSessionSample"("createdAt");
