-- One AI suggestion pass per distributor per local day.

ALTER TABLE "SalesJobSettings" ADD COLUMN "lastSuggestedDateKey" TEXT;
