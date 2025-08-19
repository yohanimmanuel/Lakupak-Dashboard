/*
  Warnings:

  - You are about to alter the column `logistics` on the `Buyer` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `notes` on the `Buyer` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `orderDetails` on the `Buyer` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `logistics` on the `Supplier` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `notes` on the `Supplier` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.
  - You are about to alter the column `supplies` on the `Supplier` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Buyer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "buyerId" TEXT NOT NULL,
    "avatar" TEXT,
    "owner" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logistics" JSONB,
    "notes" JSONB,
    "orderDetails" JSONB,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Buyer" ("address", "avatar", "businessType", "buyerId", "createdAt", "email", "id", "logistics", "notes", "orderDetails", "owner", "phone", "status", "storeName", "updatedAt") SELECT "address", "avatar", "businessType", "buyerId", "createdAt", "email", "id", "logistics", "notes", "orderDetails", "owner", "phone", "status", "storeName", "updatedAt" FROM "Buyer";
DROP TABLE "Buyer";
ALTER TABLE "new_Buyer" RENAME TO "Buyer";
CREATE UNIQUE INDEX "Buyer_buyerId_key" ON "Buyer"("buyerId");
CREATE TABLE "new_Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logistics" JSONB,
    "notes" JSONB,
    "supplies" JSONB,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Supplier" ("address", "businessType", "contact", "createdAt", "email", "id", "logistics", "name", "notes", "phone", "status", "supplierId", "supplies", "updatedAt") SELECT "address", "businessType", "contact", "createdAt", "email", "id", "logistics", "name", "notes", "phone", "status", "supplierId", "supplies", "updatedAt" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE UNIQUE INDEX "Supplier_supplierId_key" ON "Supplier"("supplierId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
