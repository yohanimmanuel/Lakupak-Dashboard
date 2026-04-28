-- Enable RLS for saved distributor payment methods.
-- Defense-in-depth only: API layer enforces real authorization.

ALTER TABLE "CompanyPaymentMethod" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application can manage company payment methods"
  ON "CompanyPaymentMethod" FOR ALL
  USING (true)
  WITH CHECK (true);

