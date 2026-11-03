import { describe, expect, it } from 'vitest';
import { assortmentSettingValue, confidenceFilterFraction } from '@/lib/assortmentOpportunities/config';
import {
  assertOpportunityTenant,
  evaluateAssortmentOpportunities,
  evidenceWindowStart,
  isEligibleSku,
  linkableMarketplaceUserId,
  measurePortfolio,
  resolvePurchasedSkuId,
  type EnginePurchase,
  type EngineRetailer,
  type EngineSku,
} from '@/lib/assortmentOpportunities/engine';

const now = new Date('2026-11-03T00:00:00.000Z');

function retailer(partial: Partial<EngineRetailer> = {}): EngineRetailer {
  return {
    buyerId: 'buyer-a',
    storeName: 'Abe store',
    segment: 'Warung',
    region: 'Cirebon',
    phone: '+62302193856',
    status: 'Active',
    ...partial,
  };
}

function sku(partial: Partial<EngineSku> = {}): EngineSku {
  return {
    variantOptionId: 1,
    sku: 'COKE-390',
    variantName: 'Original 390ml',
    productId: 'prod-coke',
    productName: 'Coca-Cola Original',
    brand: 'Coca-Cola',
    categorySlug: 'beverages',
    productType: 'Drink',
    sellingPrice: 8000,
    stockQuantity: 20,
    isActive: true,
    productStatus: 'Published',
    ...partial,
  };
}

function purchase(partial: Partial<EnginePurchase> = {}): EnginePurchase {
  return {
    buyerId: 'buyer-a',
    orderId: 'ord-1',
    orderStatus: 'Delivered',
    at: '2026-10-01T00:00:00.000Z',
    variantOptionId: 2,
    productId: 'prod-coke',
    skuSnapshot: 'COKE-1L',
    unitPrice: 12000,
    quantity: 4,
    ...partial,
  };
}

describe('SKU identity', () => {
  it('does not treat another size of the same product as the target SKU', () => {
    const known = new Set([1, 2]);
    const byCode = new Map([
      ['prod-coke::coke-390', 1],
      ['prod-coke::coke-1l', 2],
    ]);
    expect(resolvePurchasedSkuId(purchase({ variantOptionId: 2 }), known, byCode)).toBe(2);
    expect(resolvePurchasedSkuId(purchase({ variantOptionId: 2 }), known, byCode)).not.toBe(1);
    expect(
      resolvePurchasedSkuId(
        purchase({ variantOptionId: null, skuSnapshot: 'COKE-390' }),
        known,
        byCode,
      ),
    ).toBe(1);
  });

  it('uses a shared flavour as support without treating the other size as the same SKU', () => {
    const results = evaluateAssortmentOpportunities({
      now,
      retailers: [retailer(), retailer({ buyerId: 'buyer-b' })],
      skus: [
        sku({ attributes: { flavour: 'Original', size: '390ml' } }),
        sku({
          variantOptionId: 2,
          sku: 'COKE-1L',
          variantName: 'Original 1L',
          sellingPrice: 15000,
          attributes: { flavour: 'Original', size: '1L' },
        }),
      ],
      purchases: [
        purchase({ buyerId: 'buyer-a', variantOptionId: 2, orderId: 'a1', at: '2026-10-20T00:00:00.000Z' }),
        purchase({ buyerId: 'buyer-a', variantOptionId: 2, orderId: 'a2', at: '2026-09-20T00:00:00.000Z' }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 1, orderId: 'b1', skuSnapshot: 'COKE-390' }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 2, orderId: 'b2', at: '2026-10-15T00:00:00.000Z' }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 2, orderId: 'b3', at: '2026-09-01T00:00:00.000Z' }),
      ],
    });
    const match = results.find((row) => row.buyerId === 'buyer-a' && row.variantOptionId === 1);
    expect(match?.reasons).toContain('shares_flavour');
    expect(match?.reasons).not.toContain('shares_size');
    expect(results.find((row) => row.buyerId === 'buyer-a' && row.variantOptionId === 2)).toBeUndefined();
  });

  it('rejects inactive products, zero stock, and unpublished catalog rows', () => {
    expect(isEligibleSku(sku())).toBe(true);
    expect(isEligibleSku(sku({ stockQuantity: 0 }))).toBe(false);
    expect(isEligibleSku(sku({ isActive: false }))).toBe(false);
    expect(isEligibleSku(sku({ productStatus: 'Draft' }))).toBe(false);
  });
});

describe('opportunity eligibility and scoring', () => {
  const retailers = [
    retailer(),
    retailer({ buyerId: 'buyer-b', storeName: 'B store', status: 'Active' }),
    retailer({ buyerId: 'buyer-c', storeName: 'Closed', status: 'Inactive' }),
  ];
  const skus = [
    sku(),
    sku({
      variantOptionId: 2,
      sku: 'COKE-1L',
      variantName: 'Original 1L',
      sellingPrice: 15000,
    }),
  ];

  it('recommends the unbought size when the retailer already buys the family', () => {
    const results = evaluateAssortmentOpportunities({
      now,
      retailers,
      skus,
      purchases: [
        purchase({ buyerId: 'buyer-a', variantOptionId: 2, orderId: 'a1', at: '2026-10-20T00:00:00.000Z' }),
        purchase({ buyerId: 'buyer-a', variantOptionId: 2, orderId: 'a2', at: '2026-09-20T00:00:00.000Z' }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 1, orderId: 'b1', productId: 'prod-coke', skuSnapshot: 'COKE-390' }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 2, orderId: 'b2', at: '2026-10-15T00:00:00.000Z' }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 2, orderId: 'b3', at: '2026-09-01T00:00:00.000Z' }),
      ],
    });
    const match = results.find((row) => row.buyerId === 'buyer-a' && row.variantOptionId === 1);
    const adopted = results.find((row) => row.buyerId === 'buyer-a' && row.variantOptionId === 2);
    expect(match).toBeTruthy();
    expect(match?.opportunityType).toBe('new_assortment');
    expect(match?.reasons).toContain('repeated_category');
    expect(match?.reasons).toContain('buys_same_brand');
    expect(match?.breakdown.priority.label === 'high' || match?.breakdown.priority.label === 'medium').toBe(true);
    expect(match?.breakdown.signals.categoryAffinity.available).toBe(true);
    expect(adopted).toBeUndefined();
    expect(results.some((row) => row.buyerId === 'buyer-c')).toBe(false);
  });

  it('marks a lapsed SKU as reactivation and drops a retailer still inside the reorder interval', () => {
    const results = evaluateAssortmentOpportunities({
      now,
      settings: { defaultReorderDays: 30, lookbackDays: 365 },
      retailers: [retailer(), retailer({ buyerId: 'buyer-b' })],
      skus: [sku()],
      purchases: [
        purchase({
          buyerId: 'buyer-a',
          variantOptionId: 1,
          skuSnapshot: 'COKE-390',
          orderId: 'old-1',
          at: '2026-06-01T00:00:00.000Z',
        }),
        purchase({
          buyerId: 'buyer-a',
          variantOptionId: 1,
          skuSnapshot: 'COKE-390',
          orderId: 'old-2',
          at: '2026-07-01T00:00:00.000Z',
        }),
        purchase({
          buyerId: 'buyer-a',
          variantOptionId: 1,
          skuSnapshot: 'COKE-390',
          orderId: 'old-3',
          at: '2026-08-01T00:00:00.000Z',
        }),
        purchase({
          buyerId: 'buyer-b',
          variantOptionId: 1,
          skuSnapshot: 'COKE-390',
          orderId: 'recent',
          at: '2026-10-20T00:00:00.000Z',
        }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 1, orderId: 'b-other', at: '2026-09-01T00:00:00.000Z', productId: 'prod-other' }),
      ],
    });
    const lapsed = results.find((row) => row.buyerId === 'buyer-a');
    expect(lapsed?.opportunityType).toBe('reactivation');
    expect(lapsed?.recommendedAction).toBe('reorder');
    expect(results.some((row) => row.buyerId === 'buyer-b' && row.variantOptionId === 1)).toBe(false);
  });

  it('does not score missing signals as zero and suppresses a retailer with no evidence', () => {
    const results = evaluateAssortmentOpportunities({
      now,
      retailers: [retailer({ buyerId: 'quiet', storeName: 'Quiet', segment: '' })],
      skus: [sku(), sku({ variantOptionId: 9, sku: 'OTHER', productId: 'other', productName: 'Other', brand: 'Other', categorySlug: 'snacks' })],
      purchases: [],
    });
    expect(results).toHaveLength(0);
  });

  it('leaves commercial value empty when the SKU has never been purchased', () => {
    const results = evaluateAssortmentOpportunities({
      now,
      retailers: [retailer(), retailer({ buyerId: 'buyer-b' })],
      skus: [sku(), sku({ variantOptionId: 2, sku: 'COKE-1L', variantName: 'Original 1L' })],
      purchases: [
        purchase({ buyerId: 'buyer-a', variantOptionId: 2, quantity: null, unitPrice: 10000, orderId: 'a1' }),
        purchase({ buyerId: 'buyer-a', variantOptionId: 2, quantity: null, unitPrice: 10000, orderId: 'a2', at: '2026-09-01T00:00:00.000Z' }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 2, quantity: null, unitPrice: 10000, orderId: 'b1' }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 1, quantity: null, unitPrice: 8000, orderId: 'b2', skuSnapshot: 'COKE-390' }),
      ],
    });
    const target = results.find((row) => row.variantOptionId === 1);
    expect(target?.breakdown.priority.commercialValue).toBeNull();
    expect(target?.priorityScore).toBeGreaterThan(0);
    expect(['urgent', 'high', 'medium', 'low']).toContain(target?.breakdown.priority.label);
  });
});

describe('category penetration', () => {
  it('divides current SKU buyers by retailers who regularly buy the category', () => {
    const known = new Set([1]);
    const byName = new Map([['prod-coke::original 390ml', 1]]);
    expect(
      resolvePurchasedSkuId(
        purchase({ variantOptionId: null, skuSnapshot: null, variantName: 'Original 390ml' }),
        known,
        new Map(),
        byName,
      ),
    ).toBe(1);

    const results = evaluateAssortmentOpportunities({
      now,
      retailers: [retailer(), retailer({ buyerId: 'buyer-b', storeName: 'B store' })],
      skus: [sku(), sku({ variantOptionId: 2, sku: 'COKE-1L', variantName: 'Original 1L' })],
      purchases: [
        purchase({ buyerId: 'buyer-a', variantOptionId: 2, orderId: 'family', at: '2026-10-01T00:00:00.000Z' }),
        purchase({ buyerId: 'buyer-a', variantOptionId: 2, orderId: 'family-2', at: '2026-09-01T00:00:00.000Z' }),
        purchase({
          buyerId: 'buyer-a',
          variantOptionId: null,
          skuSnapshot: null,
          variantName: 'Original 390ml',
          orderStatus: 'Pending',
          orderId: 'pending',
          at: '2026-10-15T00:00:00.000Z',
        }),
        purchase({
          buyerId: 'buyer-b',
          variantOptionId: 1,
          skuSnapshot: 'COKE-390',
          orderId: 'b-now',
          at: '2026-10-20T00:00:00.000Z',
        }),
        purchase({
          buyerId: 'buyer-b',
          variantOptionId: 1,
          skuSnapshot: 'COKE-390',
          orderId: 'b-earlier',
          at: '2026-09-20T00:00:00.000Z',
        }),
      ],
    });
    const row = results.find((item) => item.buyerId === 'buyer-a' && item.variantOptionId === 1);
    expect(row?.penetration).toBe(50);
    expect(row?.breakdown.penetration).toEqual({ purchased: 1, eligible: 2 });
  });

  it('counts one delivered order and a line matched only by product name', () => {
    const measured = measurePortfolio({
      now,
      retailers: [
        retailer(),
        retailer({ buyerId: 'buyer-b', storeName: 'B store' }),
        retailer({ buyerId: 'prospect', status: 'Prospect' }),
      ],
      skus: [sku(), sku({ variantOptionId: 2, sku: 'COKE-1L', variantName: 'Original 1L' })],
      purchases: [
        purchase({
          buyerId: 'buyer-a',
          variantOptionId: null,
          skuSnapshot: null,
          productId: null,
          productName: 'Coca-Cola Original',
          orderId: 'name-only',
        }),
        purchase({ buyerId: 'buyer-b', variantOptionId: 2, orderId: 'one-order' }),
        purchase({ buyerId: 'prospect', variantOptionId: 1, orderId: 'prospect-order' }),
      ],
    });
    expect(measured.orderingRetailers).toBe(2);
    expect(measured.product.get('prod-coke')).toMatchObject({ purchased: 2, regulars: 2, penetration: 100 });
    expect(measured.sku.get(1)).toMatchObject({ purchased: 0, regulars: 2, penetration: 0 });
  });
});

describe('marketplace engagement', () => {
  const base = {
    now,
    retailers: [retailer(), retailer({ buyerId: 'buyer-b' })],
    skus: [
      sku({ attributes: { size: '390ml' } }),
      sku({ variantOptionId: 2, sku: 'COKE-1L', variantName: 'Original 1L', sellingPrice: 15000, attributes: { size: '1L' } }),
    ],
    purchases: [
      purchase({ buyerId: 'buyer-a', variantOptionId: 2, orderId: 'a1', at: '2026-10-20T00:00:00.000Z' }),
      purchase({ buyerId: 'buyer-a', variantOptionId: 2, orderId: 'a2', at: '2026-09-20T00:00:00.000Z' }),
      purchase({ buyerId: 'buyer-b', variantOptionId: 1, orderId: 'b1', skuSnapshot: 'COKE-390' }),
      purchase({ buyerId: 'buyer-b', variantOptionId: 2, orderId: 'b2', at: '2026-10-15T00:00:00.000Z' }),
      purchase({ buyerId: 'buyer-b', variantOptionId: 2, orderId: 'b3', at: '2026-09-01T00:00:00.000Z' }),
    ],
  };

  it('keeps a cart, a favorite, and a view out of the match score', () => {
    const plain = evaluateAssortmentOpportunities(base);
    const withMarket = evaluateAssortmentOpportunities({
      ...base,
      marketplace: [
        { buyerId: 'buyer-a', productId: 'prod-coke', variant: 'Original 390ml', activityType: 'cart', at: '2026-11-01T00:00:00.000Z' },
        { buyerId: 'buyer-a', productId: 'prod-coke', variant: 'Original 1L', activityType: 'viewed', at: '2026-11-01T00:00:00.000Z' },
      ],
    });
    const before = plain.find((row) => row.buyerId === 'buyer-a' && row.variantOptionId === 1);
    const after = withMarket.find((row) => row.buyerId === 'buyer-a' && row.variantOptionId === 1);
    const otherSize = withMarket.find((row) => row.buyerId === 'buyer-a' && row.variantOptionId === 2);
    expect(after?.matchScore).toBe(before?.matchScore);
    expect(after?.breakdown.priority.label).toBe(before?.breakdown.priority.label);
    expect(after?.recommendedAction).toBe('introduce');
    expect(after?.breakdown.marketplace.inCart).toBe(true);
    expect(after?.breakdown.priority.actionability).toBe(100);
    expect(otherSize).toBeUndefined();
  });

  it('ignores buyer ids that cannot be a marketplace user', () => {
    expect(linkableMarketplaceUserId(1)).toBe(1);
    expect(linkableMarketplaceUserId(4251609820)).toBeNull();
    expect(linkableMarketplaceUserId(0)).toBeNull();
    expect(linkableMarketplaceUserId(null)).toBeNull();
  });

  it('does not open a match from a view alone', () => {
    const results = evaluateAssortmentOpportunities({
      now,
      retailers: [retailer()],
      skus: [sku()],
      purchases: [],
      marketplace: [
        { buyerId: 'buyer-a', productId: 'prod-coke', variant: 'Original 390ml', activityType: 'viewed', at: '2026-11-01T00:00:00.000Z' },
      ],
    });
    expect(results).toEqual([]);
  });
});

describe('portfolio evidence window', () => {
  it('counts a purchase on the last included day and drops the day before the query bound', () => {
    const now = new Date('2026-11-03T12:00:00.000Z');
    const start = evidenceWindowStart(now);
    const inside = new Date(start.getTime() + 1).toISOString();
    const outside = start.toISOString();
    const results = measurePortfolio({
      now,
      retailers: [retailer(), retailer({ buyerId: 'buyer-b' })],
      skus: [sku()],
      purchases: [
        purchase({ orderId: 'inside', at: inside, variantOptionId: 1, skuSnapshot: 'COKE-390' }),
        purchase({ buyerId: 'buyer-b', orderId: 'outside', at: outside, variantOptionId: 1, skuSnapshot: 'COKE-390' }),
      ],
    });
    expect(results.orderingRetailers).toBe(1);
    expect(results.sku.get(1)?.purchased).toBe(1);
  });
});

describe('confidence filter percent', () => {
  it('treats the labeled input as a percent and clamps it', () => {
    expect(confidenceFilterFraction('1')).toBe(0.01);
    expect(confidenceFilterFraction('35')).toBe(0.35);
    expect(confidenceFilterFraction('100')).toBe(1);
    expect(confidenceFilterFraction('150')).toBe(1);
    expect(confidenceFilterFraction('-5')).toBe(0);
  });

  it('skips input that is not a finite number', () => {
    expect(confidenceFilterFraction('abc')).toBeNull();
    expect(confidenceFilterFraction('Infinity')).toBeNull();
  });
});

describe('assortment setting bounds', () => {
  it('keeps values that fit the columns and the five signals', () => {
    expect(assortmentSettingValue('lookbackDays', 0)).toBe(0);
    expect(assortmentSettingValue('defaultReorderDays', '45')).toBe(45);
    expect(assortmentSettingValue('minConfidence', 0)).toBe(0);
    expect(assortmentSettingValue('minConfidence', 1)).toBe(1);
    expect(assortmentSettingValue('minConfidence', 0.35)).toBe(0.35);
    expect(assortmentSettingValue('minMatchScore', 100)).toBe(100);
    expect(assortmentSettingValue('minEvidenceSignals', 5)).toBe(5);
  });

  it('skips values that would fail to save or hide every match', () => {
    expect(assortmentSettingValue('lookbackDays', -1)).toBeNull();
    expect(assortmentSettingValue('lookbackDays', 1.5)).toBeNull();
    expect(assortmentSettingValue('lookbackDays', 2147483648)).toBeNull();
    expect(assortmentSettingValue('minConfidence', 1.001)).toBeNull();
    expect(assortmentSettingValue('minConfidence', 0.1234)).toBeNull();
    expect(assortmentSettingValue('minMatchScore', 101)).toBeNull();
    expect(assortmentSettingValue('minEvidenceSignals', 6)).toBeNull();
    expect(assortmentSettingValue('minEvidenceSignals', true)).toBeNull();
    expect(assortmentSettingValue('minMatchScore', '')).toBeNull();
  });
});

describe('tenant isolation', () => {
  it('rejects an opportunity that belongs to another distributor', () => {
    expect(() => assertOpportunityTenant(4, 9)).toThrow(/outside this distributor/);
    expect(() => assertOpportunityTenant(4, 4)).not.toThrow();
    expect(() => assertOpportunityTenant(4, 0)).toThrow(/required/);
  });
});
