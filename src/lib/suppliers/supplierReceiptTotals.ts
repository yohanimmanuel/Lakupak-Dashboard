/** Reporting-only totals. Inventory remaining belongs to the Product Catalog. */
export function supplierReceiptTotals(rows: ReadonlyArray<{
  suppliesno?: string | null;
  recordType?: string | null;
  archivedAt?: Date | string | null;
  totalSupplied?: string | number | null;
  totalValue?: string | number | null;
}>): { totalSupplies: number; totalPurchases: number } {
  let totalSupplies = 0;
  let totalPurchases = 0;
  for (const row of rows) {
    if (row.archivedAt) continue;
    const no = String(row.suppliesno || '').toUpperCase();
    if (no.startsWith('AUTO-') || row.recordType === 'summary') continue;
    const qty = Number(String(row.totalSupplied ?? '0').replace(/,/g, ''));
    const value = Number(String(row.totalValue ?? '0').replace(/,/g, ''));
    if (Number.isFinite(qty)) totalSupplies += qty;
    if (Number.isFinite(value)) totalPurchases += value;
  }
  return { totalSupplies, totalPurchases };
}
