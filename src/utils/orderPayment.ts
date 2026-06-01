/** True when order payment terms are COD / cash on delivery. */
export function isCodPaymentTerms(terms?: string | null): boolean {
  const raw = (terms ?? '').toString().toLowerCase();
  return raw.includes('cod') || raw.includes('cash');
}

/** True when order uses manual bank transfer (not COD). */
export function isBankTransferPaymentTerms(terms?: string | null): boolean {
  if (isCodPaymentTerms(terms)) return false;
  const raw = (terms ?? '').toString().toLowerCase();
  return raw.includes('bank') || raw.includes('transfer');
}
