import { prisma, type Prisma } from '@/lib/db';
import type { SupplyDetail } from '@/types/client';
import { isSupplySummaryRow } from '@/lib/suppliers/supplyRecords';

type VariantSnapshot = {
  variantName: string;
  sku?: string | null;
  purchasePrice: unknown;
  stockQuantity: number;
  isActive?: boolean | null;
};

type ProductSnapshot = {
  productId: string;
  name: string;
  supplier: string;
  userId: number;
  variantOptions: VariantSnapshot[];
};

type SupplierRow = {
  id: number;
  name: string;
};

const toMoneyNumber = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    try {
      const n = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : 0;
    } catch {
      // fall through
    }
  }
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Variant-stable identity — never use shared catalog SKUs (often duplicated across options). */
export function supplyIdentity(productId: string, variantName: string): string {
  return `${String(productId).trim()}|${String(variantName || '').trim()}`;
}

export function supplyAutoNo(productId: string, variantName: string): string {
  return `AUTO-${supplyIdentity(productId, variantName)}`;
}

export const productLabel = (productName: string, variantName: string): string => {
  const name = productName.trim();
  const variant = variantName.trim();
  if (!variant || variant.toLowerCase() === 'default') return name;
  return `${name} (${variant})`;
};

function findSupplyRow(
  supplies: SupplyDetail[],
  product: ProductSnapshot,
  variant: VariantSnapshot,
  displaySku?: string,
  summaryVariantName?: string,
): SupplyDetail | undefined {
  const effectiveVariantName = summaryVariantName || String(variant.variantName || '').trim();
  const identity = supplyIdentity(product.productId, effectiveVariantName);
  const autoNo = supplyAutoNo(product.productId, effectiveVariantName);
  const label = productLabel(product.name, effectiveVariantName);
  const sku = String(displaySku || variant.sku || identity).trim();
  const summaryRows = supplies.filter(isSupplySummaryRow);
  return (
    summaryRows.find((row) => String(row.suppliesno || '') === autoNo) ||
    summaryRows.find((row) =>
      String(row.productId || '').trim() === product.productId &&
      String(row.sku || '').trim().toLowerCase() === sku.toLowerCase(),
    ) ||
    summaryRows.find((row) =>
      String(row.productId || '').trim() === product.productId &&
      String(row.variantName || '').trim().toLowerCase() === effectiveVariantName.toLowerCase(),
    ) ||
    summaryRows.find((row) => String(row.sku || '').trim() === identity) ||
    summaryRows.find((row) => String(row.product || '').trim() === label)
  );
}

function buildNewSupplyRow(
  product: ProductSnapshot,
  variant: VariantSnapshot,
): SupplyDetail {
  const qty = Math.max(0, Math.floor(Number(variant.stockQuantity) || 0));
  const unitCost = toMoneyNumber(variant.purchasePrice);
  const totalValue = Math.round(unitCost * qty);
  const displaySku = String(variant.sku ?? '').trim() || supplyIdentity(product.productId, variant.variantName);
  return {
    suppliesno: supplyAutoNo(product.productId, variant.variantName),
    sku: displaySku,
    product: productLabel(product.name, variant.variantName),
    totalSupplied: String(qty),
    totalValue: String(totalValue),
    // Match updates totals only — never write a dated history event.
    lastSuppliedDate: '',
    status: 'Active',
    recordType: 'summary',
    productId: product.productId,
    variantName: variant.variantName,
  };
}

export function mergeSupplyLists(primary: SupplyDetail[], incoming: SupplyDetail[]): SupplyDetail[] {
  const out = [...primary];
  const indexByNo = new Map(
    out
      .map((row, i) => [String(row.suppliesno || '').trim(), i] as const)
      .filter(([no]) => no.length > 0),
  );
  // Summary rows only — history events with the same product label must not collapse.
  const indexBySummaryProduct = new Map<string, number>();
  out.forEach((row, i) => {
    if (!isSupplySummaryRow(row)) return;
    const product = String(row.product || '').trim();
    if (product) indexBySummaryProduct.set(product, i);
  });

  for (const row of incoming) {
    const no = String(row.suppliesno || '').trim();
    const product = String(row.product || '').trim();

    if (!isSupplySummaryRow(row)) {
      if (no && indexByNo.has(no)) continue;
      if (no) indexByNo.set(no, out.length);
      out.push(row);
      continue;
    }

    const existingIdx =
      (no && indexByNo.has(no) ? indexByNo.get(no) : undefined) ??
      (product && indexBySummaryProduct.has(product)
        ? indexBySummaryProduct.get(product)
        : undefined);

    if (existingIdx == null) {
      if (no) indexByNo.set(no, out.length);
      if (product) indexBySummaryProduct.set(product, out.length);
      out.push(row);
      continue;
    }
    // Prefer keeping frozen totals already on the primary row; refresh labels only.
    const current = out[existingIdx];
    out[existingIdx] = {
      ...current,
      suppliesno: current.suppliesno || row.suppliesno,
      sku: current.sku || row.sku,
      product: row.product || current.product,
      status: current.status || row.status,
      lastSuppliedDate: current.lastSuppliedDate || row.lastSuppliedDate,
      recordType: 'summary',
      productId: current.productId || row.productId,
      variantName: current.variantName || row.variantName,
    };
  }
  return out;
}

export type ProductSupplyMatchHints = {
  /** Catalog / display SKUs from the product's variants */
  skus?: string[];
  /** Display labels like "Name (variant)" */
  labels?: string[];
};

/** Summary and history rows linked to this product (by productId / AUTO identity / sku / hints). */
export function belongsToProduct(
  row: SupplyDetail,
  product: Pick<ProductSnapshot, 'productId'>,
  hints?: ProductSupplyMatchHints,
): boolean {
  const id = String(product.productId || '').trim();
  if (!id) return false;
  const autoPrefix = `AUTO-${id}|`;
  const identityPrefix = `${id}|`;
  const suppliesno = String(row.suppliesno || '');
  const sku = String(row.sku || '').trim();
  const productId = String(row.productId || '').trim();
  const label = String(row.product || '').trim();
  if (
    productId === id ||
    suppliesno.startsWith(autoPrefix) ||
    sku.startsWith(identityPrefix)
  ) {
    return true;
  }
  // Hints only for legacy rows with no productId — never reassign a different explicit productId.
  if (productId) return false;
  const hintSkus = (hints?.skus || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (sku && hintSkus.includes(sku)) return true;
  const hintLabels = (hints?.labels || []).map((s) => String(s || '').trim()).filter(Boolean);
  if (label && hintLabels.includes(label)) return true;
  return false;
}

/** Pure in-memory reassignment used by sync + unit tests. */
export function applyProductToSupplierMaps(
  product: ProductSnapshot,
  suppliesBySupplierId: Map<number, SupplyDetail[]>,
  suppliers: SupplierRow[],
  dirtySupplierIds: Set<number>,
): void {
  const supplierName = String(product.supplier ?? '').trim();
  const variants = (product.variantOptions || []).filter(
    (v) => v && v.isActive !== false && String(v.variantName ?? '').trim(),
  );
  const targetKey = supplierName.toLowerCase();
  const clearMatch = supplierName.length === 0;
  const target = !clearMatch
    ? suppliers.find((row) => String(row.name || '').trim().toLowerCase() === targetKey) || null
    : null;

  // Unknown supplier name → leave existing auto rows where they are.
  if (!clearMatch && !target) return;

  // Catalog SKU/label hints — used when clearing a supplier match (and by delete).
  // Reassignment does NOT auto-move history/summary off the old supplier; the old
  // supplier UI shows an amber notice so the user can choose what to move.
  const matchHints: ProductSupplyMatchHints = {
    skus: variants
      .map((v) => String(v.sku ?? '').trim() || supplyIdentity(product.productId, v.variantName))
      .filter(Boolean),
    labels: variants.map((v) => productLabel(product.name, v.variantName)),
  };

  if (clearMatch) {
    for (const supplier of suppliers) {
      const supplies = suppliesBySupplierId.get(supplier.id) || [];
      const kept = supplies.filter((row) => !belongsToProduct(row, product, matchHints));
      if (kept.length !== supplies.length) {
        suppliesBySupplierId.set(supplier.id, kept);
        dirtySupplierIds.add(supplier.id);
      }
    }
    return;
  }

  if (!target) return;
  if (variants.length === 0) return;

  // Stamp catalog identity onto matching rows wherever they still live (no move),
  // so the old-supplier notice can resolve imports without a productId.
  for (const supplier of suppliers) {
    const supplies = suppliesBySupplierId.get(supplier.id) || [];
    let stamped = false;
    const next = supplies.map((row) => {
      if (!belongsToProduct(row, product, matchHints)) return row;
      const variantName =
        row.variantName ||
        variants.find(
          (v) =>
            (String(v.sku ?? '').trim() || supplyIdentity(product.productId, v.variantName)) ===
              String(row.sku || '').trim() ||
            productLabel(product.name, v.variantName) === String(row.product || '').trim(),
        )?.variantName ||
        row.variantName;
      if (row.productId === product.productId && row.variantName === variantName) return row;
      stamped = true;
      return {
        ...row,
        productId: row.productId || product.productId,
        variantName: variantName || row.variantName,
      };
    });
    if (stamped) {
      suppliesBySupplierId.set(supplier.id, next);
      dirtySupplierIds.add(supplier.id);
    }
  }

  // Link product onto the new supplier with an AUTO summary only — leave prior
  // supplier history/totals in place for the move-candidates notice.
  let supplies = [...(suppliesBySupplierId.get(target.id) || [])];
  let changed = false;

  // Product ID + SKU is the supplier-summary identity. If a catalog accidentally
  // contains more than one active variant with the same SKU, their stock snapshots
  // are consolidated once instead of creating multiple AUTO rows.
  const variantGroups = new Map<string, VariantSnapshot[]>();
  for (const variant of variants) {
    const displaySku = String(variant.sku ?? '').trim() || supplyIdentity(product.productId, variant.variantName);
    const groupKey = `${product.productId}|${displaySku.toLowerCase()}`;
    const group = variantGroups.get(groupKey) || [];
    group.push(variant);
    variantGroups.set(groupKey, group);
  }

  for (const group of variantGroups.values()) {
    const variant = group[0];
    const displaySku = String(variant.sku ?? '').trim() || supplyIdentity(product.productId, variant.variantName);
    const memberNames = group.map((item) => String(item.variantName || '').trim()).filter(Boolean);
    const summaryVariantName = memberNames.length > 1 ? memberNames.join(' + ') : memberNames[0] || 'Default';
    const label = productLabel(product.name, summaryVariantName);
    const autoNo = supplyAutoNo(product.productId, summaryVariantName);
    const qty = group.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.stockQuantity) || 0)), 0);
    const totalValue = Math.round(group.reduce((sum, item) => {
      const itemQty = Math.max(0, Math.floor(Number(item.stockQuantity) || 0));
      return sum + toMoneyNumber(item.purchasePrice) * itemQty;
    }, 0));
    const current = findSupplyRow(supplies, product, variant, displaySku, summaryVariantName);

    if (current && isSupplySummaryRow(current)) {
      if (
        current.product !== label ||
        current.sku !== displaySku ||
        current.suppliesno !== autoNo ||
        current.recordType !== 'summary' ||
        current.productId !== product.productId ||
        current.variantName !== summaryVariantName ||
        Number(current.totalSupplied || 0) !== qty ||
        Number(current.totalValue || 0) !== totalValue
      ) {
        current.product = label;
        current.sku = displaySku;
        current.suppliesno = autoNo;
        current.recordType = 'summary';
        current.productId = product.productId;
        current.variantName = summaryVariantName;
        // Always overwrite from current catalog stock. Never add to the previous
        // snapshot, so a supplier-list refresh cannot increase totals by itself.
        current.totalSupplied = String(qty);
        current.totalValue = String(totalValue);
        current.lastSuppliedDate = '';
        changed = true;
      }

      const beforeCount = supplies.length;
      supplies = supplies.filter((row) => {
        if (row === current || !isSupplySummaryRow(row)) return true;
        const sameProduct = String(row.productId || '').trim() === product.productId;
        const sameSku = String(row.sku || '').trim().toLowerCase() === displaySku.toLowerCase();
        const sameVariant = memberNames.some((name) =>
          String(row.variantName || '').trim().toLowerCase() === name.toLowerCase(),
        );
        const sameAutoNo = String(row.suppliesno || '').trim() === autoNo;
        return !(sameProduct && (sameSku || sameVariant) || sameAutoNo);
      });
      if (supplies.length !== beforeCount) changed = true;
      continue;
    }

    // A catalog reassignment must never mint another opening balance when this
    // product/SKU is still represented by a summary under another supplier.
    const alreadyRecordedElsewhere = suppliers.some((supplier) =>
      (suppliesBySupplierId.get(supplier.id) || []).some((row) => {
        if (!isSupplySummaryRow(row)) return false;
        const rowProductId = String(row.productId || '').trim().toLowerCase();
        const rowSku = String(row.sku || '').trim().toLowerCase();
        const rowVariant = String(row.variantName || '').trim().toLowerCase();
        return rowProductId === product.productId.trim().toLowerCase() &&
          (rowSku === displaySku.toLowerCase() || memberNames.some((name) => rowVariant === name.toLowerCase()));
      }),
    );
    if (alreadyRecordedElsewhere) continue;

    const newRow = buildNewSupplyRow(product, variant);
    newRow.suppliesno = autoNo;
    newRow.sku = displaySku;
    newRow.product = label;
    newRow.variantName = summaryVariantName;
    newRow.totalSupplied = String(qty);
    newRow.totalValue = String(totalValue);
    supplies.push(newRow);
    changed = true;
  }

  if (changed) {
    suppliesBySupplierId.set(target.id, supplies);
    dirtySupplierIds.add(target.id);
  }
}

/** Strip every summary + history row linked to the product from all supplier maps. */
export function removeProductFromSupplierMaps(
  product: Pick<ProductSnapshot, 'productId'>,
  suppliesBySupplierId: Map<number, SupplyDetail[]>,
  suppliers: SupplierRow[],
  dirtySupplierIds: Set<number>,
  hints?: ProductSupplyMatchHints,
): void {
  const productId = String(product.productId || '').trim();
  if (!productId) return;

  for (const supplier of suppliers) {
    const supplies = suppliesBySupplierId.get(supplier.id) || [];
    const kept = supplies.filter((row) => !belongsToProduct(row, product, hints));
    if (kept.length !== supplies.length) {
      suppliesBySupplierId.set(supplier.id, kept);
      dirtySupplierIds.add(supplier.id);
    }
  }
}

export type ProductVariantSupplyIdentity = {
  variantName: string;
  sku?: string | null;
};

const normalizeSupplyIdentity = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase();

/**
 * Remove only the specified variant's supplier summary/history rows.
 * Explicit Product IDs always take precedence over legacy SKU/label matching.
 */
export function removeProductVariantsFromSupplierMaps(
  product: { productId: string; name?: string },
  removedVariants: ProductVariantSupplyIdentity[],
  allVariants: ProductVariantSupplyIdentity[],
  suppliesBySupplierId: Map<number, SupplyDetail[]>,
  suppliers: SupplierRow[],
  dirtySupplierIds: Set<number>,
): void {
  const productId = String(product.productId || '').trim();
  if (!productId || removedVariants.length === 0) return;

  const allSkuCounts = new Map<string, number>();
  for (const variant of allVariants) {
    const sku = normalizeSupplyIdentity(variant.sku);
    if (sku) allSkuCounts.set(sku, (allSkuCounts.get(sku) || 0) + 1);
  }

  const removed = removedVariants.map((variant) => {
    const variantName = String(variant.variantName || '').trim();
    const sku = String(variant.sku || '').trim();
    return {
      variantName,
      sku,
      nameKey: normalizeSupplyIdentity(variantName),
      skuKey: normalizeSupplyIdentity(sku),
      autoNo: `AUTO-${productId}|${variantName}`,
      compositeSku: `${productId}|${variantName}`,
      labelKey: normalizeSupplyIdentity(productLabel(String(product.name || ''), variantName)),
    };
  }).filter((variant) => variant.nameKey);

  if (removed.length === 0) return;

  for (const supplier of suppliers) {
    const supplies = suppliesBySupplierId.get(supplier.id) || [];
    const kept = supplies.filter((row) => {
      const rowProductId = String(row.productId || '').trim();
      const rowVariantName = normalizeSupplyIdentity(row.variantName);
      const rowSupplyNo = String(row.suppliesno || '').trim();
      const rowSku = String(row.sku || '').trim();
      const rowSkuKey = normalizeSupplyIdentity(rowSku);
      const rowLabelKey = normalizeSupplyIdentity(row.product);

      // Never remove a row explicitly linked to another catalog product.
      if (rowProductId && rowProductId !== productId) return true;

      const matchesRemovedVariant = removed.some((variant) => {
        if (rowVariantName) return rowProductId === productId && rowVariantName === variant.nameKey;
        if (rowSupplyNo === variant.autoNo || rowSku === variant.compositeSku) return true;
        if (rowLabelKey && rowLabelKey === variant.labelKey) return true;

        // A plain legacy SKU is safe only when it identifies exactly one variant
        // across this product. Shared parent SKUs must not delete sibling variants.
        const skuIsUnique = variant.skuKey && allSkuCounts.get(variant.skuKey) === 1;
        if (skuIsUnique && rowSkuKey === variant.skuKey) return true;

        // Rows with this Product ID but no variant metadata can be attributed only
        // when the product has a single known variant; otherwise leave them intact.
        if (rowProductId === productId && allVariants.length === 1) return true;
        return false;
      });

      return !matchesRemovedVariant;
    });

    if (kept.length !== supplies.length) {
      suppliesBySupplierId.set(supplier.id, kept);
      dirtySupplierIds.add(supplier.id);
    }
  }
}

async function rewriteSupplierSupplyMaps(
  tx: Prisma.TransactionClient,
  userId: number,
  mutate: (
    suppliesBySupplierId: Map<number, SupplyDetail[]>,
    suppliers: SupplierRow[],
    dirtySupplierIds: Set<number>,
  ) => void,
): Promise<number> {
  if (!userId) return 0;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}, ${879_332})`;
  const suppliers = await tx.supplier.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      name: true,
      supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
    },
  });

  const { supplyDetailFromRecord, replaceSupplierSupplyRecords } = await import(
    '@/lib/suppliers/supplyRecordStore'
  );
  const suppliesBySupplierId = new Map<number, SupplyDetail[]>(
    suppliers.map((row) => [row.id, row.supplyRecords.map(supplyDetailFromRecord)]),
  );
  const dirtySupplierIds = new Set<number>();
  mutate(suppliesBySupplierId, suppliers, dirtySupplierIds);

  for (const supplierId of dirtySupplierIds) {
    const next = suppliesBySupplierId.get(supplierId) || [];
    await replaceSupplierSupplyRecords(tx, supplierId, next);
    await tx.supplier.update({
      where: { id: supplierId },
      data: { updatedAt: new Date() },
    });
  }
  return dirtySupplierIds.size;
}

/**
 * Remove variant-linked summary and history rows from every supplier using the
 * caller's transaction. Used by Product Catalog variant deletion/deactivation.
 */
export async function removeProductVariantsSuppliesInTransaction(
  tx: Prisma.TransactionClient,
  args: {
    userId: number;
    productId: string;
    name?: string;
    removedVariants: ProductVariantSupplyIdentity[];
    allVariants: ProductVariantSupplyIdentity[];
  },
): Promise<number> {
  return rewriteSupplierSupplyMaps(tx, args.userId, (maps, suppliers, dirty) => {
    removeProductVariantsFromSupplierMaps(
      { productId: args.productId, name: args.name },
      args.removedVariants,
      args.allVariants,
      maps,
      suppliers,
      dirty,
    );
  });
}

/** Remove all linked summary and history supplies for a deleted product in the caller's transaction. */
export async function removeProductSuppliesInTransaction(
  tx: Prisma.TransactionClient,
  args: {
    userId: number;
    productId: string;
    name?: string;
    variantOptions?: VariantSnapshot[];
  },
): Promise<number> {
  const variants = (args.variantOptions || []).filter((variant) => String(variant.variantName || '').trim());
  const hints: ProductSupplyMatchHints = {
    skus: variants.map((variant) => String(variant.sku || '').trim()).filter(Boolean),
    labels: variants.map((variant) => productLabel(String(args.name || ''), variant.variantName)),
  };
  return rewriteSupplierSupplyMaps(tx, args.userId, (maps, suppliers, dirty) => {
    removeProductFromSupplierMaps({ productId: args.productId }, maps, suppliers, dirty, hints);
  });
}

/** Backward-compatible transaction wrapper for callers outside a transaction. */
export async function removeProductSupplies(args: {
  userId: number;
  productId: string;
  name?: string;
  variantOptions?: VariantSnapshot[];
}): Promise<void> {
  const productId = String(args.productId || '').trim();
  if (!args.userId || !productId) return;
  await prisma.$transaction(async (tx) => {
    await removeProductSuppliesInTransaction(tx, { ...args, productId });
  });
}

/**
 * Link a product's variants into an existing CRM supplier's supplies list.
 * Does not create suppliers — users must import/create suppliers first, then match.
 * When the matched supplier changes, linked summary AND history rows move off the
 * previous supplier(s) onto the new one (frozen summary totals preserved when moving).
 */
export async function syncSupplierFromProduct(product: ProductSnapshot): Promise<void> {
  if (!product.userId || !String(product.productId || '').trim()) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${product.userId}, ${879_332})`;

    const suppliers = await tx.supplier.findMany({
      where: { userId: product.userId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    const { supplyDetailFromRecord, replaceSupplierSupplyRecords } = await import(
      '@/lib/suppliers/supplyRecordStore'
    );
    const suppliesBySupplierId = new Map<number, SupplyDetail[]>(
      suppliers.map((row) => [row.id, row.supplyRecords.map(supplyDetailFromRecord)]),
    );
    const dirtySupplierIds = new Set<number>();

    applyProductToSupplierMaps(product, suppliesBySupplierId, suppliers, dirtySupplierIds);

    for (const supplierId of dirtySupplierIds) {
      const next = suppliesBySupplierId.get(supplierId) || [];
      await replaceSupplierSupplyRecords(tx, supplierId, next);
      await tx.supplier.update({
        where: { id: supplierId },
        data: { updatedAt: new Date() },
      });
    }
  });
}

/**
 * Backfill linked supplies onto existing matched suppliers from all of a user's products.
 * Loads suppliers once, applies every product in memory, and writes each changed supplier once.
 */
export async function syncAllProductSuppliersForUser(userId: number): Promise<{
  productsProcessed: number;
  suppliersTouched: number;
}> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return { productsProcessed: 0, suppliersTouched: 0 };
  }

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}, ${879_332})`;

      const products = await tx.product.findMany({
        where: {
          userId,
          supplier: { not: '' },
        },
        select: {
          productId: true,
          name: true,
          supplier: true,
          userId: true,
          variantOptions: {
            select: {
              variantName: true,
              sku: true,
              purchasePrice: true,
              stockQuantity: true,
              isActive: true,
            },
          },
        },
      });
      const suppliers = await tx.supplier.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          name: true,
          supplyRecords: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        },
      });

      if (products.length === 0 || suppliers.length === 0) {
        return { productsProcessed: products.length, suppliersTouched: 0 };
      }

      const { supplyDetailFromRecord, replaceSupplierSupplyRecords } = await import(
        '@/lib/suppliers/supplyRecordStore'
      );
      const suppliesBySupplierId = new Map<number, SupplyDetail[]>(
        suppliers.map((row) => [row.id, row.supplyRecords.map(supplyDetailFromRecord)]),
      );
      const dirtySupplierIds = new Set<number>();

      // Group by normalized supplier name for stable processing order.
      const productsBySupplier = new Map<string, ProductSnapshot[]>();
      for (const product of products) {
        const name = String(product.supplier ?? '').trim();
        if (!name || !product.userId) continue;
        const key = name.toLowerCase();
        const list = productsBySupplier.get(key) || [];
        list.push({
          productId: product.productId,
          name: product.name,
          supplier: name,
          userId: product.userId,
          variantOptions: product.variantOptions,
        });
        productsBySupplier.set(key, list);
      }

      for (const group of productsBySupplier.values()) {
        for (const product of group) {
          applyProductToSupplierMaps(product, suppliesBySupplierId, suppliers, dirtySupplierIds);
        }
      }

      for (const supplierId of dirtySupplierIds) {
        const next = suppliesBySupplierId.get(supplierId) || [];
        await replaceSupplierSupplyRecords(tx, supplierId, next);
        await tx.supplier.update({
          where: { id: supplierId },
          data: { updatedAt: new Date() },
        });
      }

      return {
        productsProcessed: products.length,
        suppliersTouched: dirtySupplierIds.size,
      };
    },
    {
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}
