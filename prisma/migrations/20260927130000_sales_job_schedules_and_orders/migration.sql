-- Link take-order and collect-payment jobs to an order, and store per-job visit dates with WhatsApp reminder times.

ALTER TABLE "SalesJob" ADD COLUMN "orderId" TEXT;

CREATE TABLE "SalesJobSchedule" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMPTZ(3) NOT NULL,
    "reminderHour" INTEGER NOT NULL,
    "reminderMinute" INTEGER NOT NULL,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "SalesJobSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesJob_orderId_idx" ON "SalesJob"("orderId");
CREATE INDEX "SalesJobSchedule_jobId_idx" ON "SalesJobSchedule"("jobId");
CREATE INDEX "SalesJobSchedule_scheduledDate_reminderHour_reminderMinute_idx" ON "SalesJobSchedule"("scheduledDate", "reminderHour", "reminderMinute");

ALTER TABLE "SalesJob" ADD CONSTRAINT "SalesJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("orderId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesJobSchedule" ADD CONSTRAINT "SalesJobSchedule_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SalesJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesJobSchedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow sales job schedule operations" ON "SalesJobSchedule" FOR ALL USING (true) WITH CHECK (true);
