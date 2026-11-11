import { describe, expect, it } from 'vitest';
import type { SupplyDetail } from '@/types/client';
import {
  computeSupplyStockEffects,
  finalizeSupplierSuppliesSave,
} from '@/lib/suppliers/applySupplierSuppliesSave';
import {
  applySummaryDelta,
  isSupplyReceivedToday,
  todayYmdJakarta,
} from '@/lib/suppliers/supplyRecords';

function history(overrides: Partial<SupplyDetail> = {}): SupplyDetail {
  return {
    suppliesno: 'HIST-1',
    sku: 'SKU-2934806021',
    product: 'awdawd (a: aa)',
    totalSupplied: '120',
    totalValue: '10000000',
    lastDelivery: '2026-11-11',
    status: 'Active',
    recordType: 'history',
    productId: 'LKP-TEST',
    variantName: 'aa',
    updateCurrentStock: true,
    ...overrides,
  };
}

describe('computeSupplyStockEffects (Update Current Stock checkbox)', () => {
  it('keeps Jakarta today helper available for legacy today fallbacks', () => {
    const today = todayYmdJakarta(new Date('2026-11-10T17:30:00.000Z'));
    expect(today).toBe('2026-11-11');
    expect(isSupplyReceivedToday('2026-11-11', today)).toBe(true);
  });

  it('applies stock and totals for a checked new history row on any date', () => {
    const incoming = [history({ lastDelivery: '2026-10-01', updateCurrentStock: true })];
    const effects = computeSupplyStockEffects([], incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0].reason).toBe('add');
    expect(effects[0].quantityDelta).toBe(120);
    expect(effects[0].applyStock).toBe(true);
  });

  it('applies totals only for unchecked new history rows', () => {
    const incoming = [history({ updateCurrentStock: false })];
    const effects = computeSupplyStockEffects([], incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0].reason).toBe('add');
    expect(effects[0].quantityDelta).toBe(120);
    expect(effects[0].applyStock).toBe(false);
  });

  it('does not reverse stock when a checked history row is removed without a delete marker', () => {
    const previous = [history()];
    expect(computeSupplyStockEffects(previous, [])).toEqual([]);
  });

  it('reverses stock and totals when delete marker opts in to update stock', () => {
    const previous = [history({ stockApplied: true })];
    const incoming = [
      {
        ...history(),
        __delete: true as const,
        updateCurrentStock: true,
      },
    ];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0].reason).toBe('delete');
    expect(effects[0].quantityDelta).toBe(-120);
    expect(effects[0].valueDelta).toBe(-10000000);
    expect(effects[0].applyStock).toBe(true);
  });

  it('reverses totals only when delete marker leaves update stock unchecked', () => {
    const previous = [history({ stockApplied: true })];
    const incoming = [
      {
        ...history(),
        __delete: true as const,
        updateCurrentStock: false,
      },
    ];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0].reason).toBe('delete');
    expect(effects[0].quantityDelta).toBe(-120);
    expect(effects[0].valueDelta).toBe(-10000000);
    expect(effects[0].applyStock).toBe(false);
  });

  it('does not reverse stock when deleting after unchecking (no marker)', () => {
    const previous = [history({ updateCurrentStock: false })];
    expect(computeSupplyStockEffects(previous, [])).toEqual([]);
  });

  it('applies qty delta edits while checked, including decreases', () => {
    const previous = [history({ totalSupplied: '120', updateCurrentStock: true })];
    const incoming = [history({ totalSupplied: '100', updateCurrentStock: true })];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0].reason).toBe('edit');
    expect(effects[0].quantityDelta).toBe(-20);
  });

  it('does not reverse stock when identity clears to unresolved while checked', () => {
    const previous = [
      history({
        sku: 'SKU-OLD',
        productId: 'LKP-OLD',
        variantName: 'old',
        totalSupplied: '120',
        updateCurrentStock: true,
      }),
    ];
    const incoming = [
      history({
        sku: '',
        productId: '',
        variantName: '',
        product: 'Ambiguous product label',
        totalSupplied: '120',
        updateCurrentStock: true,
      }),
    ];
    expect(computeSupplyStockEffects(previous, incoming)).toEqual([]);
  });

  it('reverses previous identity and applies new when sku/product changes while checked', () => {
    const previous = [
      history({
        sku: 'SKU-OLD',
        productId: 'LKP-OLD',
        variantName: 'old',
        totalSupplied: '120',
        totalValue: '10000000',
        updateCurrentStock: true,
      }),
    ];
    const incoming = [
      history({
        sku: 'SKU-NEW',
        productId: 'LKP-NEW',
        variantName: 'new',
        totalSupplied: '50',
        totalValue: '4000000',
        updateCurrentStock: true,
      }),
    ];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(2);
    expect(effects[0]).toMatchObject({
      reason: 'edit',
      quantityDelta: -120,
      valueDelta: -10000000,
      row: expect.objectContaining({ sku: 'SKU-OLD', productId: 'LKP-OLD' }),
    });
    expect(effects[1]).toMatchObject({
      reason: 'edit',
      quantityDelta: 50,
      valueDelta: 4000000,
      row: expect.objectContaining({ sku: 'SKU-NEW', productId: 'LKP-NEW' }),
    });
  });

  it('first-time enabling after totals-only save applies stock once without re-adding totals', () => {
    const previous = [history({ updateCurrentStock: false, stockApplied: false })];
    const incoming = [history({ updateCurrentStock: true, stockApplied: false })];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0].reason).toBe('enable');
    expect(effects[0].quantityDelta).toBe(120);
    expect(effects[0].applyStock).toBe(true);
    expect(effects[0].applySummary).toBe(false);
  });

  it('untick→save→tick on same row still applies product stock once (ignores poisoned client stockApplied)', () => {
    // First save was totals-only; DB correctly has stockApplied=false.
    const previous = [history({ updateCurrentStock: false, stockApplied: false, totalSupplied: '10' })];
    // Client may still send stockApplied:true from old UI; server must use prev flag.
    const incoming = [
      history({ updateCurrentStock: true, stockApplied: true, totalSupplied: '10' }),
    ];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      reason: 'enable',
      quantityDelta: 10,
      applyStock: true,
      applySummary: false,
    });
  });

  it('unticking Update Stock after it was applied reverses product stock only', () => {
    const previous = [history({ updateCurrentStock: true, stockApplied: true, totalSupplied: '10' })];
    const incoming = [history({ updateCurrentStock: false, stockApplied: true, totalSupplied: '10' })];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      reason: 'disable',
      quantityDelta: -10,
      applyStock: true,
      applySummary: false,
    });
  });

  it('re-ticking after a disable applies stock again without changing totals', () => {
    const previous = [history({ updateCurrentStock: false, stockApplied: false, totalSupplied: '10' })];
    const incoming = [history({ updateCurrentStock: true, stockApplied: false, totalSupplied: '10' })];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toEqual([
      expect.objectContaining({
        reason: 'enable',
        quantityDelta: 10,
        applyStock: true,
        applySummary: false,
      }),
    ]);
  });

  it('unchecked qty edits update totals only', () => {
    const previous = [history({ updateCurrentStock: false, stockApplied: false, totalSupplied: '10' })];
    const incoming = [history({ updateCurrentStock: false, stockApplied: false, totalSupplied: '25' })];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0].reason).toBe('edit');
    expect(effects[0].quantityDelta).toBe(15);
    expect(effects[0].applyStock).toBe(false);
  });

  it('re-checking Update Stock after a prior apply does not add stock again', () => {
    const previous = [history({ updateCurrentStock: false, stockApplied: true, totalSupplied: '120' })];
    const incoming = [history({ updateCurrentStock: true, stockApplied: true, totalSupplied: '120' })];
    expect(computeSupplyStockEffects(previous, incoming)).toEqual([]);
  });

  it('adds exactly once when an id-keyed row survives and an identical new-id duplicate is added', () => {
    const shared = {
      sku: 'SKU-1',
      product: 'Peperro',
      productId: 'LKP-1',
      variantName: 'BBQ',
      lastDelivery: '2026-11-01',
      totalSupplied: '10',
      totalValue: '1000',
      stockApplied: true,
      updateCurrentStock: true,
    };
    const previous = [history({ ...shared, suppliesno: 'HIST-A' })];
    const incoming = [
      history({ ...shared, suppliesno: 'HIST-A' }),
      history({ ...shared, suppliesno: 'HIST-NEW' }),
    ];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toEqual([
      expect.objectContaining({
        reason: 'add',
        quantityDelta: 10,
        applyStock: true,
        row: expect.objectContaining({ suppliesno: 'HIST-NEW' }),
      }),
    ]);
  });

  it('deletes an unmatched duplicate-fingerprint sibling independently', () => {
    const shared = {
      sku: 'SKU-1',
      product: 'Peperro',
      productId: 'LKP-1',
      variantName: 'BBQ',
      lastDelivery: '2026-11-01',
      totalSupplied: '10',
      totalValue: '1000',
      stockApplied: true,
      updateCurrentStock: true,
    };
    const previous = [
      history({ ...shared, suppliesno: 'HIST-A' }),
      history({ ...shared, suppliesno: 'HIST-B' }),
    ];
    const incoming = [
      history({ ...shared, suppliesno: 'HIST-A' }),
      {
        ...history({ ...shared, suppliesno: 'HIST-B' }),
        __delete: true as const,
        updateCurrentStock: false,
      },
    ];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toEqual([
      expect.objectContaining({
        reason: 'delete',
        quantityDelta: -10,
        applyStock: false,
        row: expect.objectContaining({ suppliesno: 'HIST-B' }),
      }),
    ]);
  });

  it('does not re-add stock when suppliesno is blank/regenerated but row fingerprint matches', () => {
    const previous = [
      history({
        suppliesno: '',
        updateCurrentStock: false,
        stockApplied: true,
        totalSupplied: '10',
        totalValue: '10000000',
        sku: 'SKU-10932857',
        product: 'Peperro snacks (Size: 40/Box | Flavor: Oreo)',
        lastDelivery: '2026-11-03',
      }),
    ];
    const incoming = [
      history({
        suppliesno: 'HIST-NEW-RANDOM',
        updateCurrentStock: true,
        stockApplied: false,
        totalSupplied: '10',
        totalValue: '10000000',
        sku: 'SKU-10932857',
        product: 'Peperro snacks (Size: 40/Box | Flavor: Oreo)',
        lastDelivery: '2026-11-03',
      }),
    ];
    expect(computeSupplyStockEffects(previous, incoming)).toEqual([]);
  });

  it('re-check after prior apply still applies qty deltas if received qty changed', () => {
    const previous = [history({ updateCurrentStock: false, stockApplied: true, totalSupplied: '120' })];
    const incoming = [history({ updateCurrentStock: true, stockApplied: true, totalSupplied: '150' })];
    const effects = computeSupplyStockEffects(previous, incoming);
    expect(effects).toHaveLength(1);
    expect(effects[0].reason).toBe('edit');
    expect(effects[0].quantityDelta).toBe(30);
  });

  it('finalize retains stockApplied when suppliesno regenerates but fingerprint matches', async () => {
    const previous = [
      history({
        suppliesno: '',
        updateCurrentStock: false,
        stockApplied: true,
        totalSupplied: '10',
        totalValue: '1000',
      }),
    ];
    const incoming = [
      history({
        suppliesno: 'HIST-REGENERATED',
        updateCurrentStock: false,
        stockApplied: false,
        totalSupplied: '10',
        totalValue: '1000',
      }),
    ];
    const result = await finalizeSupplierSuppliesSave({
      userId: 1,
      previousSuppliesRaw: JSON.stringify(previous),
      nextSuppliesRaw: JSON.stringify(incoming),
    });
    const rows = JSON.parse(result.suppliesJson) as SupplyDetail[];
    const historyRow = rows.find((row) => row.recordType === 'history');
    expect(historyRow?.stockApplied).toBe(true);
  });

  it('applies signed summary deltas for delete reversals', () => {
    let supplies: SupplyDetail[] = [
      {
        suppliesno: 'AUTO-1',
        sku: 'SKU-2934806021',
        product: 'awdawd (a: aa)',
        totalSupplied: '121',
        totalValue: '10007000',
        lastDelivery: '',
        status: 'Active',
        recordType: 'summary',
        productId: 'LKP-TEST',
        variantName: 'aa',
      },
    ];
    supplies = applySummaryDelta(supplies, {
      sku: 'SKU-2934806021',
      product: 'awdawd (a: aa)',
      quantity: -120,
      totalValue: -10000000,
      productId: 'LKP-TEST',
      variantName: 'aa',
    });
    const summary = supplies.find((r) => r.recordType === 'summary');
    expect(summary?.totalSupplied).toBe('1');
    expect(summary?.totalValue).toBe('7000');
  });
});
