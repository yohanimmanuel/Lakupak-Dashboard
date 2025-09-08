-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "bpomApproved" BOOLEAN DEFAULT false,
ADD COLUMN     "halalCertified" BOOLEAN DEFAULT false,
ADD COLUMN     "originalProduct" BOOLEAN DEFAULT true,
ADD COLUMN     "returnPolicyDays" INTEGER DEFAULT 7;
