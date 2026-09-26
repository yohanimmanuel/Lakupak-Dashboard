-- Active rates cannot stand without a client. Draft them when the buyer row goes away,
-- before the foreign key clears buyerId.
CREATE OR REPLACE FUNCTION "Offer_draft_on_buyer_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "Offer"
  SET "status" = 'draft',
      "updatedAt" = NOW()
  WHERE "buyerId" = OLD."buyerId"
    AND "status" = 'active';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "Offer_draft_on_buyer_delete" ON "Buyer";
CREATE TRIGGER "Offer_draft_on_buyer_delete"
BEFORE DELETE ON "Buyer"
FOR EACH ROW
EXECUTE FUNCTION "Offer_draft_on_buyer_delete"();

-- Rates that already lost their client should not stay active.
UPDATE "Offer"
SET "status" = 'draft',
    "updatedAt" = NOW()
WHERE "buyerId" IS NULL
  AND "status" = 'active';
