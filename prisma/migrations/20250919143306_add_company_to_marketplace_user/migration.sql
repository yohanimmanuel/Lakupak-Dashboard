-- AlterTable
ALTER TABLE "public"."MarketplaceUser" ADD COLUMN     "companyId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."MarketplaceUser" ADD CONSTRAINT "MarketplaceUser_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
