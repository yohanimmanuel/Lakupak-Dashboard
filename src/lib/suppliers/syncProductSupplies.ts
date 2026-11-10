import { prisma } from '@/lib/db';
import type { SupplyDetail } from '@/types/client';

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
  supplies: string | null;
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

const todayYmd = () => new Date().toISOString().slice(0, 10);

/** Variant-stable identity — never use shared catalog SKUs (often duplicated across options). */
export function supplyIdentity(productId: string, variantName: string): string {
  return `${String(productId).trim()}|${String(variantName || '').trim()}`;
}

export function supplyAutoNo(productId: string, variantName: string): string {
  return `AUTO-${supplyIdentity(productId, variantName)}`;
}

const productLabel = (productName: string, variantName: string): string => {
  const name = productName.trim();
  const variant = variantName.trim();
  if (!variant || variant.toLowerCase() === 'default') return name;
  return `${name} (${variant})`;
};

function parseSupplies(raw: string | null | undefined): SupplyDetail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SupplyDetail[]) : [];
  } catch {
    return [];
  }
}

function findSupplyRow(
  supplies: SupplyDetail[],
  product: ProductSnapshot,
  variant: VariantSnapshot,
): SupplyDetail | undefined {
  const identity = supplyIdentity(product.productId, variant.variantName);
  const autoNo = supplyAutoNo(product.productId, variant.variantName);
  const label = productLabel(product.name, variant.variantName);

  return (
    supplies.find((row) => String(row.suppliesno || '') === autoNo) ||
    supplies.find((row) => String(row.sku || '').trim() === identity) ||
    supplies.find((row) => String(row.product || '').trim() === label)
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
    lastDelivery: todayYmd(),
    status: 'Active',
  };
}

function mergeSupplyLists(primary: SupplyDetail[], incoming: SupplyDetail[]): SupplyDetail[] {
  const out = [...primary];
  const indexByNo = new Map(out.map((row, i) => [String(row.suppliesno || '').trim(), i]));
  const indexByProduct = new Map(out.map((row, i) => [String(row.product || '').trim(), i]));

  for (const row of incoming) {
    const no = String(row.suppliesno || '').trim();
    const product = String(row.product || '').trim();
    const existingIdx =
      (no && indexByNo.has(no) ? indexByNo.get(no) : undefined) ??
      (product && indexByProduct.has(product) ? indexByProduct.get(product) : undefined);

    if (existingIdx == null) {
      indexByNo.set(no, out.length);
      indexByProduct.set(product, out.length);
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
      lastDelivery: current.lastDelivery || row.lastDelivery,
    };
  }
  return out;
}

/** Only auto-linked rows (never detach manual supplies by display label alone). */
function belongsToProduct(row: SupplyDetail, product: ProductSnapshot): boolean {
  const id = String(product.productId || '').trim();
  if (!id) return false;
  const autoPrefix = `AUTO-${id}|`;
  const identityPrefix = `${id}|`;
  const suppliesno = String(row.suppliesno || '');
  const sku = String(row.sku || '').trim();
  return suppliesno.startsWith(autoPrefix) || sku.startsWith(identityPrefix);
}

function applyProductToSupplierMaps(
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

  const movedRows: SupplyDetail[] = [];

  for (const supplier of suppliers) {
    const supplies = suppliesBySupplierId.get(supplier.id) || [];
    const kept: SupplyDetail[] = [];
    let changed = false;
    const isTarget = target != null && supplier.id === target.id;

    for (const row of supplies) {
      if (!belongsToProduct(row, product)) {
        kept.push(row);
        continue;
      }
      if (isTarget) {
        kept.push(row);
        continue;
      }
      if (clearMatch) {
        changed = true;
        continue;
      }
      movedRows.push(row);
      changed = true;
    }

    if (changed) {
      suppliesBySupplierId.set(supplier.id, kept);
      dirtySupplierIds.add(supplier.id);
    }
  }

  if (clearMatch || !target) return;
  if (variants.length === 0 && movedRows.length === 0) return;

  let supplies = mergeSupplyLists(suppliesBySupplierId.get(target.id) || [], movedRows);
  let changed = movedRows.length > 0;

  for (const variant of variants) {
    const label = productLabel(product.name, variant.variantName);
    const displaySku =
      String(variant.sku ?? '').trim() || supplyIdentity(product.productId, variant.variantName);
    const autoNo = supplyAutoNo(product.productId, variant.variantName);
    const current = findSupplyRow(supplies, product, variant);

    if (current) {
      if (
        current.product !== label ||
        current.sku !== displaySku ||
        current.suppliesno !== autoNo
      ) {
        current.product = label;
        current.sku = displaySku;
        current.suppliesno = autoNo;
        changed = true;
      }
      continue;
    }

    supplies.push(buildNewSupplyRow(product, variant));
    changed = true;
  }

  if (changed) {
    suppliesBySupplierId.set(target.id, supplies);
    dirtySupplierIds.add(target.id);
  }
}

/**
 * Link a product's variants into an existing CRM supplier's supplies list.
 * Does not create suppliers — users must import/create suppliers first, then match.
 * When the matched supplier changes, auto-linked rows are moved off the previous
 * supplier(s) onto the new one (frozen totals preserved when moving).
 */
export async function syncSupplierFromProduct(product: ProductSnapshot): Promise<void> {
  if (!product.userId || !String(product.productId || '').trim()) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${product.userId}, ${879_332})`;

    const suppliers = await tx.supplier.findMany({
      where: { userId: product.userId },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, supplies: true },
    });

    const suppliesBySupplierId = new Map<number, SupplyDetail[]>(
      suppliers.map((row) => [row.id, parseSupplies(row.supplies)]),
    );
    const dirtySupplierIds = new Set<number>();

    applyProductToSupplierMaps(product, suppliesBySupplierId, suppliers, dirtySupplierIds);

    for (const supplierId of dirtySupplierIds) {
      await tx.supplier.update({
        where: { id: supplierId },
        data: { supplies: JSON.stringify(suppliesBySupplierId.get(supplierId) || []) },
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
        select: { id: true, name: true, supplies: true },
      });

      if (products.length === 0 || suppliers.length === 0) {
        return { productsProcessed: products.length, suppliersTouched: 0 };
      }

      const suppliesBySupplierId = new Map<number, SupplyDetail[]>(
        suppliers.map((row) => [row.id, parseSupplies(row.supplies)]),
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
        await tx.supplier.update({
          where: { id: supplierId },
          data: { supplies: JSON.stringify(suppliesBySupplierId.get(supplierId) || []) },
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
