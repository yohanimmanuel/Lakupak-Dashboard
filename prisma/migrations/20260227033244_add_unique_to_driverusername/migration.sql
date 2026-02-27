/*
  Warnings:

  - A unique constraint covering the columns `[driverUsername]` on the table `Fleet` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Fleet_driverUsername_key" ON "Fleet"("driverUsername");
