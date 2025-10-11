-- AlterTable
ALTER TABLE "public"."OfferProduct" ADD COLUMN     "appliedDiscountTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
