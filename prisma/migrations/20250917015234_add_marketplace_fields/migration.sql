-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "marketplaceStatus" TEXT DEFAULT 'Not Published',
ADD COLUMN     "publishedAt" TIMESTAMP(3);
