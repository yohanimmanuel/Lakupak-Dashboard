import type { SupplyDetail } from '@/types/client';
import { isSupplyHistoryRow, isSupplySummaryRow } from '@/lib/suppliers/supplyRecords';
export type CatalogVariantRef = {
  productId: string;
  variantName: string;
  sku: string;
  productLabel: string;
  /** Current product.supplier name (trimmed). */
  supplierName: string;
};

export type SupplyMoveCandidate = {
  productId: string;
  variantName: string;
  sku: string;
  productLabel: string;
  targetSupplierName: string;
  historyCount: number;
  totalSupplied: number;
  totalValue: number;
};

const norm = (value: unknown): string => String(value ?? '').trim().toLowerCase();

function toQty(value: unknown): number {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build lookup indexes for resolving supply rows → catalog variants.
 * SKU/label maps only include values that uniquely identify one variant.
 */
export function buildCatalogVariantIndexes(variants: CatalogVariantRef[]): {
  byProductVariant: Map<string, CatalogVariantRef>;
  byUniqueSku: Map<string, CatalogVariantRef>;
  byUniqueLabel: Map<string, CatalogVariantRef>;
} {
  const byProductVariant = new Map<string, CatalogVariantRef>();
  const skuCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  const bySku = new Map<string, CatalogVariantRef>();
  const byLabel = new Map<string, CatalogVariantRef>();

  for (const variant of variants) {
    const productId = String(variant.productId || '').trim();
    const variantName = String(variant.variantName || '').trim();
    if (!productId || !variantName) continue;
    byProductVariant.set(`${norm(productId)}|${norm(variantName)}`, variant);

    const sku = norm(variant.sku);
    if (sku) {
      skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
      bySku.set(sku, variant);
    }
    const label = norm(variant.productLabel);
    if (label) {
      labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
      byLabel.set(label, variant);
    }
  }

  const byUniqueSku = new Map<string, CatalogVariantRef>();
  for (const [sku, count] of skuCounts) {
    if (count === 1) {
      const variant = bySku.get(sku);
      if (variant) byUniqueSku.set(sku, variant);
    }
  }
  const byUniqueLabel = new Map<string, CatalogVariantRef>();
  for (const [label, count] of labelCounts) {
    if (count === 1) {
      const variant = byLabel.get(label);
      if (variant) byUniqueLabel.set(label, variant);
    }
  }

  return { byProductVariant, byUniqueSku, byUniqueLabel };
}

export function resolveSupplyRowVariant(
  row: SupplyDetail,
  indexes: ReturnType<typeof buildCatalogVariantIndexes>,
): CatalogVariantRef | null {
  const productId = String(row.productId || '').trim();
  const variantName = String(row.variantName || '').trim();
  if (productId && variantName) {
    const hit = indexes.byProductVariant.get(`${norm(productId)}|${norm(variantName)}`);
    if (hit) return hit;
  }
  if (productId) {
    // productId alone — only if exactly one variant key starts with it is too loose; require variantName.
  }
  const sku = norm(row.sku);
  if (sku) {
    const hit = indexes.byUniqueSku.get(sku);
    if (hit) return hit;
  }
  const label = norm(row.product);
  if (label) {
    const hit = indexes.byUniqueLabel.get(label);
    if (hit) return hit;
    const base = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (base && base !== label) {
      const baseHit = indexes.byUniqueLabel.get(base);
      if (baseHit) return baseHit;
    }
  }
  return null;
}

/**
 * History (and leftover summary) rows on this supplier whose resolved product
 * is now assigned to a different supplier name.
 */
export function findSupplyMoveCandidates(args: {
  supplies: SupplyDetail[];
  currentSupplierName: string;
  variants: CatalogVariantRef[];
  /** Existing supplier names (lowercased) — target must exist. */
  supplierNames: string[];
}): SupplyMoveCandidate[] {
  const currentKey = norm(args.currentSupplierName);
  const knownSuppliers = new Set(args.supplierNames.map(norm).filter(Boolean));
  const indexes = buildCatalogVariantIndexes(args.variants);
  const groups = new Map<string, SupplyMoveCandidate>();

  for (const row of args.supplies) {
    const resolved = resolveSupplyRowVariant(row, indexes);
    if (!resolved) continue;
    const targetName = String(resolved.supplierName || '').trim();
    const targetKey = norm(targetName);
    if (!targetKey || targetKey === currentKey) continue;
    if (!knownSuppliers.has(targetKey)) continue;

    const key = `${norm(resolved.productId)}|${norm(resolved.variantName)}`;
    const existing = groups.get(key);
    const qty = toQty(row.totalSupplied);
    const value = toQty(row.totalValue);
    const isHistory = isSupplyHistoryRow(row);
    if (existing) {
      if (isHistory) {
        existing.historyCount += 1;
        existing.totalSupplied += qty;
        existing.totalValue += value;
      } else if (existing.historyCount === 0 && isSupplySummaryRow(row)) {
        // Leftover summary only (history already moved elsewhere).
        existing.totalSupplied += qty;
        existing.totalValue += value;
      }
      continue;
    }
    groups.set(key, {
      productId: resolved.productId,
      variantName: resolved.variantName,
      sku: resolved.sku,
      productLabel: resolved.productLabel,
      targetSupplierName: targetName,
      historyCount: isHistory ? 1 : 0,
      totalSupplied: qty,
      totalValue: value,
    });
  }

  return [...groups.values()].sort((a, b) =>
    a.sku.localeCompare(b.sku) || a.productLabel.localeCompare(b.productLabel),
  );
}

/** Rows on this supplier that belong to any of the selected product variants. */
export function pickRowsForVariants(
  supplies: SupplyDetail[],
  variants: Array<{ productId: string; variantName: string }>,
  catalogVariants: CatalogVariantRef[],
): { keep: SupplyDetail[]; move: SupplyDetail[] } {
  const selected = new Set(
    variants.map((v) => `${norm(v.productId)}|${norm(v.variantName)}`),
  );
  const indexes = buildCatalogVariantIndexes(catalogVariants);
  const keep: SupplyDetail[] = [];
  const move: SupplyDetail[] = [];

  for (const row of supplies) {
    const resolved = resolveSupplyRowVariant(row, indexes);
    if (!resolved) {
      keep.push(row);
      continue;
    }
    const key = `${norm(resolved.productId)}|${norm(resolved.variantName)}`;
    if (!selected.has(key)) {
      keep.push(row);
      continue;
    }
    move.push({
      ...row,
      productId: resolved.productId,
      variantName: resolved.variantName,
      sku: row.sku || resolved.sku,
      product: row.product || resolved.productLabel,
    });
  }

  return { keep, move };
}
