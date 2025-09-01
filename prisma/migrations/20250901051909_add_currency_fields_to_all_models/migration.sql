-- AlterTable
ALTER TABLE "public"."Buyer" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'IDR';

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'IDR';

-- AlterTable
ALTER TABLE "public"."Supplier" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'IDR';

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'IDR';
