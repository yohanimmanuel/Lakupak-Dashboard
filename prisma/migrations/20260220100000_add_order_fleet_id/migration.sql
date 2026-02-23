-- AlterTable
ALTER TABLE "Order" ADD COLUMN "fleetId" INTEGER;

-- CreateIndex
CREATE INDEX "Order_fleetId_idx" ON "Order"("fleetId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
