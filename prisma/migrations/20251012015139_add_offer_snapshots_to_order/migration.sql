-- AlterTable
ALTER TABLE "public"."OrderItem" ADD COLUMN     "discountPercentage" DOUBLE PRECISION,
ADD COLUMN     "offerApplied" BOOLEAN DEFAULT false,
ADD COLUMN     "offerBadgeSnapshot" TEXT,
ADD COLUMN     "offerNameSnapshot" TEXT,
ADD COLUMN     "originalPriceSnapshot" TEXT,
ADD COLUMN     "promotionDetailsSnapshot" TEXT;
