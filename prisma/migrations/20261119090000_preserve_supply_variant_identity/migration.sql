-- Preserve historical variant identity independently of the live catalog foreign key.
ALTER TABLE "SupplyRecord" ADD COLUMN "historicalVariantOptionId" INTEGER;
UPDATE "SupplyRecord" SET "historicalVariantOptionId" = "variantOptionId"
WHERE "variantOptionId" IS NOT NULL;
CREATE INDEX "SupplyRecord_historicalVariantOptionId_idx" ON "SupplyRecord"("historicalVariantOptionId");

-- A snapshot is write-once. The FK may become NULL through ON DELETE SET NULL,
-- but a new catalog variant must never replace the historical identity.
CREATE OR REPLACE FUNCTION preserve_supply_variant_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."variantOptionId" IS NOT NULL THEN
      IF NEW."historicalVariantOptionId" IS NOT NULL AND NEW."historicalVariantOptionId" <> NEW."variantOptionId" THEN
        RAISE EXCEPTION 'Supply variant identity mismatch';
      END IF;
      NEW."historicalVariantOptionId" := NEW."variantOptionId";
    END IF;
  ELSE
    IF OLD."historicalVariantOptionId" IS NOT NULL THEN
      IF NEW."historicalVariantOptionId" IS DISTINCT FROM OLD."historicalVariantOptionId" THEN
        RAISE EXCEPTION 'Historical supply variant identity cannot be changed';
      END IF;
      IF NEW."variantOptionId" IS NOT NULL AND NEW."variantOptionId" <> OLD."historicalVariantOptionId" THEN
        RAISE EXCEPTION 'Cannot reattach supply to another catalog variant';
      END IF;
    ELSIF NEW."variantOptionId" IS NOT NULL THEN
      NEW."historicalVariantOptionId" := NEW."variantOptionId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER supply_variant_identity_guard
BEFORE INSERT OR UPDATE ON "SupplyRecord"
FOR EACH ROW EXECUTE FUNCTION preserve_supply_variant_identity();
