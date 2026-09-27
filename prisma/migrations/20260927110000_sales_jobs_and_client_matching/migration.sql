-- Sales jobs (field tasks) and client-match queue.

CREATE TABLE "SalesJob" (
    "id" TEXT NOT NULL,
    "distributorId" INTEGER NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "priorityReason" TEXT,
    "suggestedProducts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledDate" TIMESTAMPTZ(3) NOT NULL,
    "completionNotes" TEXT,
    "completionData" JSONB,
    "whatsappMessageId" TEXT,
    "dispatchNote" TEXT,
    "dispatchedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SalesJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesJobSettings" (
    "distributorId" INTEGER NOT NULL,
    "dispatchHour" INTEGER NOT NULL DEFAULT 7,
    "dispatchMinute" INTEGER NOT NULL DEFAULT 0,
    "unresolvedCutoffHour" INTEGER NOT NULL DEFAULT 18,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SalesJobSettings_pkey" PRIMARY KEY ("distributorId")
);

CREATE TABLE "ClientMatchCandidate" (
    "id" TEXT NOT NULL,
    "distributorId" INTEGER NOT NULL,
    "existingClientId" TEXT NOT NULL,
    "incomingOrderId" TEXT NOT NULL,
    "provisionalClientId" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "matchedSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL,
    "autoMerged" BOOLEAN NOT NULL DEFAULT false,
    "undoSnapshot" JSONB,
    "undoneAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClientMatchCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesJob_distributorId_status_idx" ON "SalesJob"("distributorId", "status");
CREATE INDEX "SalesJob_assignedTo_scheduledDate_idx" ON "SalesJob"("assignedTo", "scheduledDate");
CREATE INDEX "SalesJob_clientId_idx" ON "SalesJob"("clientId");
CREATE INDEX "SalesJob_distributorId_scheduledDate_idx" ON "SalesJob"("distributorId", "scheduledDate");

CREATE INDEX "ClientMatchCandidate_distributorId_status_idx" ON "ClientMatchCandidate"("distributorId", "status");
CREATE INDEX "ClientMatchCandidate_distributorId_autoMerged_createdAt_idx" ON "ClientMatchCandidate"("distributorId", "autoMerged", "createdAt");
CREATE INDEX "ClientMatchCandidate_incomingOrderId_idx" ON "ClientMatchCandidate"("incomingOrderId");
CREATE INDEX "ClientMatchCandidate_existingClientId_idx" ON "ClientMatchCandidate"("existingClientId");

ALTER TABLE "SalesJob" ADD CONSTRAINT "SalesJob_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesJob" ADD CONSTRAINT "SalesJob_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "SalesAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesJob" ADD CONSTRAINT "SalesJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Buyer"("buyerId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesJobSettings" ADD CONSTRAINT "SalesJobSettings_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientMatchCandidate" ADD CONSTRAINT "ClientMatchCandidate_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMatchCandidate" ADD CONSTRAINT "ClientMatchCandidate_existingClientId_fkey" FOREIGN KEY ("existingClientId") REFERENCES "Buyer"("buyerId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMatchCandidate" ADD CONSTRAINT "ClientMatchCandidate_incomingOrderId_fkey" FOREIGN KEY ("incomingOrderId") REFERENCES "Order"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalesJobSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientMatchCandidate" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow sales job operations" ON "SalesJob" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow sales job settings operations" ON "SalesJobSettings" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow client match operations" ON "ClientMatchCandidate" FOR ALL USING (true) WITH CHECK (true);
