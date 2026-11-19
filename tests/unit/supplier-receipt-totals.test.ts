import { describe, expect, it } from 'vitest';
import { supplierReceiptTotals } from '../../src/lib/suppliers/supplierReceiptTotals';

describe('supplier receipt-only reporting', () => {
  it('counts repeated receipts independently but excludes legacy openings and archives', () => {
    expect(supplierReceiptTotals([
      { suppliesno: 'AUTO-1', recordType: 'summary', totalSupplied: '2200', totalValue: '19360000' },
      { suppliesno: 'HIST-1', recordType: 'history', totalSupplied: '600', totalValue: '5000' },
      { suppliesno: 'HIST-2', recordType: 'history', totalSupplied: '600', totalValue: '5000' },
      { suppliesno: 'HIST-3', recordType: 'history', totalSupplied: '50', totalValue: '100', archivedAt: new Date() },
    ])).toEqual({ totalSupplies: 1200, totalPurchases: 10000 });
  });
});
