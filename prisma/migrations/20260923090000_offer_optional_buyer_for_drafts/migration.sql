-- Allow incomplete drafts without a client assigned yet.
ALTER TABLE "Offer" ALTER COLUMN "buyerId" DROP NOT NULL;
