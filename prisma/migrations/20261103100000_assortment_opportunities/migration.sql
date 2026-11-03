-- SKU–retailer assortment opportunities. API routes enforce distributor scope.

CREATE TABLE "AssortmentOpportunitySettings" (
  "distributorId" INTEGER NOT NULL,
  "lookbackDays" INTEGER NOT NULL DEFAULT 365,
  "defaultReorderDays" INTEGER NOT NULL DEFAULT 45,
  "minConfidence" DECIMAL(4,3) NOT NULL DEFAULT 0.350,
  "minMatchScore" INTEGER NOT NULL DEFAULT 40,
  "minEvidenceSignals" INTEGER NOT NULL DEFAULT 2,
  "matchWeights" JSONB NOT NULL,
  "priorityWeights" JSONB NOT NULL,
  "lastRefreshedAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AssortmentOpportunitySettings_pkey" PRIMARY KEY ("distributorId")
);

CREATE TABLE "AssortmentOpportunity" (
  "id" TEXT NOT NULL,
  "distributorId" INTEGER NOT NULL,
  "buyerId" TEXT NOT NULL,
  "variantOptionId" INTEGER NOT NULL,
  "productId" TEXT NOT NULL,
  "opportunityType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "matchScore" INTEGER NOT NULL,
  "priorityScore" INTEGER NOT NULL,
  "confidence" DECIMAL(4,3) NOT NULL,
  "penetration" DECIMAL(5,2) NOT NULL,
  "skuLabel" TEXT NOT NULL,
  "variantName" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "categorySlug" TEXT,
  "retailerName" TEXT NOT NULL,
  "segment" TEXT NOT NULL,
  "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "breakdown" JSONB NOT NULL,
  "recommendedAction" TEXT NOT NULL,
  "lastPurchasedAt" TIMESTAMPTZ(3),
  "reorderIntervalDays" INTEGER,
  "reviewedAt" TIMESTAMPTZ(3),
  "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AssortmentOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssortmentOpportunityEvent" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "distributorId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssortmentOpportunityEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssortmentOpportunity_distributorId_buyerId_variantOptionId_key"
  ON "AssortmentOpportunity"("distributorId", "buyerId", "variantOptionId");
CREATE INDEX "AssortmentOpportunity_distributorId_status_priorityScore_idx"
  ON "AssortmentOpportunity"("distributorId", "status", "priorityScore");
CREATE INDEX "AssortmentOpportunity_distributorId_opportunityType_idx"
  ON "AssortmentOpportunity"("distributorId", "opportunityType");
CREATE INDEX "AssortmentOpportunity_distributorId_brand_idx"
  ON "AssortmentOpportunity"("distributorId", "brand");
CREATE INDEX "AssortmentOpportunity_distributorId_segment_idx"
  ON "AssortmentOpportunity"("distributorId", "segment");
CREATE INDEX "AssortmentOpportunity_buyerId_idx" ON "AssortmentOpportunity"("buyerId");
CREATE INDEX "AssortmentOpportunity_variantOptionId_idx" ON "AssortmentOpportunity"("variantOptionId");
CREATE INDEX "AssortmentOpportunityEvent_opportunityId_createdAt_idx"
  ON "AssortmentOpportunityEvent"("opportunityId", "createdAt");
CREATE INDEX "AssortmentOpportunityEvent_distributorId_createdAt_idx"
  ON "AssortmentOpportunityEvent"("distributorId", "createdAt");

ALTER TABLE "AssortmentOpportunitySettings"
  ADD CONSTRAINT "AssortmentOpportunitySettings_distributorId_fkey"
  FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssortmentOpportunity"
  ADD CONSTRAINT "AssortmentOpportunity_distributorId_fkey"
  FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssortmentOpportunity"
  ADD CONSTRAINT "AssortmentOpportunity_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "Buyer"("buyerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssortmentOpportunity"
  ADD CONSTRAINT "AssortmentOpportunity_variantOptionId_fkey"
  FOREIGN KEY ("variantOptionId") REFERENCES "VariantOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssortmentOpportunityEvent"
  ADD CONSTRAINT "AssortmentOpportunityEvent_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "AssortmentOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssortmentOpportunitySettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssortmentOpportunity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssortmentOpportunityEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow assortment opportunity settings operations"
  ON "AssortmentOpportunitySettings" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow assortment opportunity operations"
  ON "AssortmentOpportunity" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow assortment opportunity event operations"
  ON "AssortmentOpportunityEvent" FOR ALL USING (true) WITH CHECK (true);
