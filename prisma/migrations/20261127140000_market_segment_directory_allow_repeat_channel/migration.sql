DROP INDEX IF EXISTS "MarketSegmentDirectory_userId_mainChannel_subChannel_key";

CREATE UNIQUE INDEX "MarketSegmentDirectory_userId_mainChannel_subChannel_outletExamples_key"
  ON "MarketSegmentDirectory"("userId", "mainChannel", "subChannel", "outletExamples");
