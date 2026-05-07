-- Enable RLS for commission invoices.
-- Defense-in-depth only: API layer enforces real authorization.

ALTER TABLE "CommissionInvoice" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application can manage commission invoices"
  ON "CommissionInvoice" FOR ALL
  USING (true)
  WITH CHECK (true);

