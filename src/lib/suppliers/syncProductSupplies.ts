import { prisma, type Prisma } from '@/lib/db';
import type { SupplyDetail } from '@/types/client';

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

/** Retired compatibility entry point. Catalog supplier changes never create
 * AUTO summaries, transfer receipts, or mutate historical supplier data.
 * Retained temporarily for older callers; the production sync is a no-op too.
 */
export function applyProductToSupplierMaps(
  _product: ProductSnapshot,
  _suppliesBySupplierId: Map<number, SupplyDetail[]>,
  _suppliers: SupplierRow[],
  _dirtySupplierIds: Set<number>,
): void {
  // Receipt history is created only by explicit supplier actions.
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
 * Catalog changes must not create AUTO summaries or transfer historical receipts.
 */
/**
 * Receipt-only supplier architecture: product catalog changes do not create,
 * overwrite, transfer or delete supplier receipts or legacy AUTO snapshots.
 * Kept as a compatibility entry point for existing product mutations.
 */
export async function syncSupplierFromProductInTransaction(
  _tx: Prisma.TransactionClient,
  _product: ProductSnapshot,
): Promise<void> {
  // Supplier records are written only by explicit receipt/import actions.
}

/** Backward-compatible wrapper for callers outside an existing transaction. */
export async function syncSupplierFromProduct(product: ProductSnapshot): Promise<void> {
  if (!product.userId || !String(product.productId || '').trim()) return;
  await prisma.$transaction(async (tx) => {
    await syncSupplierFromProductInTransaction(tx, product);
  });
}

/** No-op compatibility entry point; never backfill stock as supplier receipts. */
export async function syncAllProductSuppliersForUser(_userId: number): Promise<{
  productsProcessed: number;
  suppliersTouched: number;
}> {
  return { productsProcessed: 0, suppliersTouched: 0 };
}
