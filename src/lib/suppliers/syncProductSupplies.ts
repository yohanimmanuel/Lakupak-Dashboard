import { prisma, type Prisma } from '@/lib/db';
import type { SupplyDetail } from '@/types/client';
import { isSupplySummaryRow } from '@/lib/suppliers/supplyRecords';

type VariantSnapshot = {
  id?: number;
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
export function supplyIdentity(productId: string, variantName: string, variantOptionId?: number): string {
  return variantOptionId != null ? `${String(productId).trim()}|variant:${variantOptionId}` : `${String(productId).trim()}|${String(variantName || '').trim()}`;
}

export function supplyAutoNo(productId: string, variantName: string, variantOptionId?: number): string {
  return `AUTO-${supplyIdentity(productId, variantName, variantOptionId)}`;
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
  const identity = supplyIdentity(product.productId, effectiveVariantName, variant.id);
  const autoNo = supplyAutoNo(product.productId, effectiveVariantName, variant.id);
  const label = productLabel(product.name, effectiveVariantName);
  const sku = String(displaySku || variant.sku || identity).trim();
  const summaryRows = supplies.filter(isSupplySummaryRow);
  // An old snapshot with a deleted VariantOption ID must never be adopted by
  // a newly-created variant that happens to reuse its name or SKU.
  const eligible = summaryRows.filter((row) =>
    row.variantOptionId == null || variant.id == null || Number(row.variantOptionId) === variant.id,
  );
  const byVariantName = eligible.find((row) =>
    String(row.productId || '').trim() === product.productId &&
    String(row.variantName || '').trim().toLowerCase() === effectiveVariantName.toLowerCase(),
  );
  const skuMatches = eligible.filter((row) =>
    String(row.productId || '').trim() === product.productId &&
    String(row.sku || '').trim().toLowerCase() === sku.toLowerCase(),
  );
  return (
    (variant.id != null ? summaryRows.find((row) => row.variantOptionId != null && Number(row.variantOptionId) === variant.id) : undefined) ||
    eligible.find((row) => String(row.suppliesno || '') === autoNo) ||
    byVariantName ||
    (skuMatches.length === 1 ? skuMatches[0] : undefined) ||
    eligible.find((row) => String(row.sku || '').trim() === identity) ||
    eligible.find((row) => String(row.product || '').trim() === label)
  );
}

function buildNewSupplyRow(
  product: ProductSnapshot,
  variant: VariantSnapshot,
): SupplyDetail {
  const qty = Math.max(0, Math.floor(Number(variant.stockQuantity) || 0));
  const unitCost = toMoneyNumber(variant.purchasePrice);
  const totalValue = Math.round(unitCost * qty);
  const displaySku = String(variant.sku ?? '').trim() || supplyIdentity(product.productId, variant.variantName, variant.id);
  return {
    suppliesno: supplyAutoNo(product.productId, variant.variantName, variant.id),
    sku: displaySku,
    variantOptionId: variant.id ?? null,
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
  // Only legacy summaries without variant IDs may use label fallback.
  // A recreated variant must never adopt an archived summary with the same label.
  const indexBySummaryProduct = new Map<string, number>();
  out.forEach((row, i) => {
    if (!isSupplySummaryRow(row)) return;
    const product = String(row.product || '').trim();
    if (product && row.variantOptionId == null) indexBySummaryProduct.set(product, i);
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
      (row.variantOptionId == null && product && indexBySummaryProduct.has(product)
        ? indexBySummaryProduct.get(product)
        : undefined);

    if (existingIdx == null) {
      if (no) indexByNo.set(no, out.length);
      if (product && row.variantOptionId == null) indexBySummaryProduct.set(product, out.length);
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
    // Unassigning a supplier changes catalog metadata, not prior receipts.
    // Historical rows remain under the original supplier until explicitly edited.
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

  // Each VariantOption owns its own summary. SKUs are editable and may be reused.
  for (const variant of variants) {
    const displaySku = String(variant.sku ?? '').trim() || supplyIdentity(product.productId, variant.variantName, variant.id);
    const label = productLabel(product.name, variant.variantName);
    const autoNo = supplyAutoNo(product.productId, variant.variantName, variant.id);
    const qty = Math.max(0, Math.floor(Number(variant.stockQuantity) || 0));
    const totalValue = Math.round(toMoneyNumber(variant.purchasePrice) * qty);
    const current = findSupplyRow(supplies, product, variant, displaySku, variant.variantName);

    if (current && isSupplySummaryRow(current)) {
      if (
        current.product !== label ||
        current.sku !== displaySku ||
        current.suppliesno !== autoNo ||
        current.recordType !== 'summary' ||
        current.productId !== product.productId ||
        Number(current.variantOptionId || 0) !== Number(variant.id || 0) ||
        current.variantName !== variant.variantName ||
        Number(current.totalSupplied || 0) !== qty ||
        Number(current.totalValue || 0) !== totalValue
      ) {
        current.product = label;
        current.sku = displaySku;
        current.suppliesno = autoNo;
        current.recordType = 'summary';
        current.productId = product.productId;
        current.variantOptionId = variant.id ?? null;
        current.variantName = variant.variantName;
        current.totalSupplied = String(qty);
        current.totalValue = String(totalValue);
        current.lastSuppliedDate = '';
        changed = true;
      }

      const beforeCount = supplies.length;
      supplies = supplies.filter((row) => {
        if (row === current || !isSupplySummaryRow(row)) return true;
        if (row.variantOptionId != null && variant.id != null) return Number(row.variantOptionId) !== variant.id;
        const sameProduct = String(row.productId || '').trim() === product.productId;
        const sameAutoNo = String(row.suppliesno || '').trim() === autoNo;
        const sameVariant = String(row.variantName || '').trim().toLowerCase() === variant.variantName.toLowerCase();
        return !(sameProduct && (sameVariant || sameAutoNo));
      });
      if (supplies.length !== beforeCount) changed = true;
      continue;
    }

    const alreadyRecordedElsewhere = suppliers.some((supplier) =>
      (suppliesBySupplierId.get(supplier.id) || []).some((row) =>
        isSupplySummaryRow(row) &&
        (variant.id != null && row.variantOptionId != null
          ? Number(row.variantOptionId) === variant.id
          : String(row.productId || '').trim().toLowerCase() === product.productId.trim().toLowerCase() &&
            String(row.variantName || '').trim().toLowerCase() === variant.variantName.toLowerCase()),
      ),
    );
    if (alreadyRecordedElsewhere) continue;

    const newRow = buildNewSupplyRow(product, variant);
    newRow.suppliesno = autoNo;
    newRow.sku = displaySku;
    newRow.product = label;
    newRow.productId = product.productId;
    newRow.variantOptionId = variant.id ?? null;
    newRow.variantName = variant.variantName;
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
  variantOptionId?: number | null;
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

  // Catalog deletion is not an accounting event. Supplier receipt history and
  // summary/opening-balance snapshots must survive even when their catalog option
  // no longer exists. A future option with the same name/SKU is a NEW identity.
  // Intentionally leave the stored rows untouched; the UI can display their
  // frozen product/variant labels without a live catalog dropdown option.
  void allVariants;
  void suppliesBySupplierId;
  void suppliers;
  void dirtySupplierIds;
  void removedVariants;

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
  // Preserve accounting snapshots on product deletion too. In particular, do
  // not remove history or summary rows merely because the catalog ID vanished.
  void tx;
  void args;
  return 0;
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
export async function syncSupplierFromProductInTransaction(
  tx: Prisma.TransactionClient,
  product: ProductSnapshot,
): Promise<void> {
  if (!product.userId || !String(product.productId || '').trim()) return;

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

// Do not automatically reattach ID-less legacy rows by SKU, alias or label.
// Recreated variants can reuse all of those fields without sharing identity.

applyProductToSupplierMaps(product, suppliesBySupplierId, suppliers, dirtySupplierIds);

for (const supplierId of dirtySupplierIds) {
  const next = suppliesBySupplierId.get(supplierId) || [];
  await replaceSupplierSupplyRecords(tx, supplierId, next);
  await tx.supplier.update({
    where: { id: supplierId },
    data: { updatedAt: new Date() },
  });
}
}

/** Backward-compatible wrapper for callers outside an existing transaction. */
export async function syncSupplierFromProduct(product: ProductSnapshot): Promise<void> {
  if (!product.userId || !String(product.productId || '').trim()) return;
  await prisma.$transaction(async (tx) => {
    await syncSupplierFromProductInTransaction(tx, product);
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
              id: true,
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
