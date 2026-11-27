ALTER TABLE "MarketSegmentDirectory" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow market segment directory operations" ON "MarketSegmentDirectory";

CREATE POLICY "Allow market segment directory operations" ON "MarketSegmentDirectory" FOR ALL USING (true) WITH CHECK (true);
