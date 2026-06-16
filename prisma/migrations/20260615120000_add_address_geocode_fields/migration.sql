-- Store geocoded coordinates on buyer addresses to avoid repeat Google API calls.
ALTER TABLE "Address"
  ADD COLUMN "addressNormalized" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "geocodePrecision" TEXT;

CREATE INDEX "Address_addressNormalized_idx" ON "Address"("addressNormalized");
