ALTER TABLE "VariantSegmentPrice" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow variant segment price operations" ON "VariantSegmentPrice";

CREATE POLICY "Allow variant segment price operations" ON "VariantSegmentPrice" FOR ALL USING (true) WITH CHECK (true);