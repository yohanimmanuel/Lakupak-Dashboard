import type { Prisma, PrismaClient } from '@/lib/prisma-generated';
import type { SupplyDetail } from '@/types/client';
import { getSupplyRecordType, getSupplyReceivedInput, mergeDuplicateSummaryRows } from '@/lib/suppliers/supplyRecords';
import { isSupplyDeleteMarker } from '@/lib/suppliers/applySupplierSuppliesSave';
import { resolveCatalogIdentity } from '@/lib/catalog/identityResolver';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type SupplyRecordRow = {
  suppliesno: string;
  sku: string;
  product: string;
  /** Original quantity selected by the supplier, e.g. 4 when receivedUnit is Cartons. */
  receivedQuantity: string;
  /** Original stock unit selected by the supplier. */
  receivedUnit: string;
  /** Canonical inventory quantity, always stored in Pieces. */
  totalSupplied: string;
  totalValue: string;
  lastSuppliedDate: string;
  status: string;
  deliverySuccess: string | null;
  recordType: string;
  productId: string | null;
  variantName: string | null;
  variantOptionId: number | null;
  historicalVariantOptionId?: number | null;
  updateCurrentStock: boolean;
  stockApplied: boolean;
  sortOrder: number;
};

export function parseSuppliesJsonCompat(raw: string | null | undefined): SupplyDetail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value: unknown) => {
      const row = value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};
      const { lastDelivery: legacyLastDelivery, ...rest } = row;
      const receivedInput = getSupplyReceivedInput({
        receivedQuantity: row.receivedQuantity == null ? undefined : String(row.receivedQuantity),
        receivedUnit: row.receivedUnit == null ? undefined : String(row.receivedUnit),
        totalSupplied: String(row.totalSupplied || ''),
      });
      return {
        ...rest,
        receivedQuantity: receivedInput.receivedQuantity,
        receivedUnit: receivedInput.receivedUnit,
        lastSuppliedDate: String(row.lastSuppliedDate || legacyLastDelivery || ''),
      } as unknown as SupplyDetail;
    });
  } catch {
    return [];
  }
}

export function supplyDetailFromRecord(row: SupplyRecordRow): SupplyDetail {
  const receivedInput = getSupplyReceivedInput({
    receivedQuantity: row.receivedQuantity,
    receivedUnit: row.receivedUnit,
    totalSupplied: row.totalSupplied,
  });
  return {
    suppliesno: row.suppliesno || '',
    sku: row.sku || '',
    product: row.product || '',
    // Keep the supplier's entered package quantity/unit separate from canonical stock.
    receivedQuantity: receivedInput.receivedQuantity,
    receivedUnit: receivedInput.receivedUnit,
    totalSupplied: row.totalSupplied || '',
    totalValue: row.totalValue || '',
    lastSuppliedDate: row.lastSuppliedDate || '',
    status: row.status || 'Active',
    deliverySuccess: row.deliverySuccess || undefined,
    recordType: getSupplyRecordType({ suppliesno: row.suppliesno, recordType: row.recordType as SupplyDetail['recordType'] }),
    productId: row.productId || undefined,
    variantName: row.variantName || undefined,
    variantOptionId: row.variantOptionId ?? row.historicalVariantOptionId ?? undefined,
    updateCurrentStock: row.updateCurrentStock === true,
    stockApplied: row.stockApplied === true,
  };
}

export function serializeSupplyRecords(rows: SupplyRecordRow[]): string {
  return JSON.stringify(rows.map(supplyDetailFromRecord));
}

export async function loadSupplierSupplies(
  db: DbClient,
  supplierRefId: number,
): Promise<SupplyDetail[]> {
  const rows = await db.supplyRecord.findMany({
    where: { supplierRefId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map(supplyDetailFromRecord);
}

export async function loadSupplierSuppliesJson(
  db: DbClient,
  supplierRefId: number,
): Promise<string | null> {
  const rows = await db.supplyRecord.findMany({
    where: { supplierRefId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  if (rows.length > 0) return serializeSupplyRecords(rows);
  return null;
}

/** Flatten supplies payload into SupplyRecord createMany rows (empty/markers → []). */
export function buildSupplyRecordCreateManyRows(
  supplierRefId: number,
  details: SupplyDetail[] | string | null | undefined,
): Array<{
  supplierRefId: number;
  suppliesno: string;
  sku: string;
  product: string;
  receivedQuantity: string;
  receivedUnit: string;
  totalSupplied: string;
  totalValue: string;
  lastSuppliedDate: string;
  status: string;
  deliverySuccess: string | null;
  recordType: string;
  productId: string | null;
  variantName: string | null;
  variantOptionId: number | null;
  historicalVariantOptionId?: number | null;
  updateCurrentStock: boolean;
  stockApplied: boolean;
  sortOrder: number;
}> {
  const raw =
    typeof details === 'string'
      ? parseSuppliesJsonCompat(details)
      : Array.isArray(details)
        ? details
        : [];
  const list = raw.filter((row) => !isSupplyDeleteMarker(row));
  return list.map((row, index) => {
    const recordType = getSupplyRecordType(row);
    const receivedInput = recordType === 'history' ? getSupplyReceivedInput(row) : null;
    return {
      supplierRefId,
      suppliesno: String(row.suppliesno || ''),
      sku: String(row.sku || ''),
      product: String(row.product || ''),
      receivedQuantity: receivedInput?.receivedQuantity ?? '',
      receivedUnit: receivedInput?.receivedUnit ?? 'Pieces',
      totalSupplied: String(row.totalSupplied || ''),
      totalValue: String(row.totalValue || ''),
      lastSuppliedDate: String(row.lastSuppliedDate || (row as SupplyDetail & { lastDelivery?: string }).lastDelivery || ''),
      status: String(row.status || 'Active'),
      deliverySuccess: row.deliverySuccess != null ? String(row.deliverySuccess) : null,
      recordType,
      productId: row.productId ? String(row.productId) : null,
      variantName: row.variantName ? String(row.variantName) : null,
      variantOptionId: row.variantOptionId != null && Number.isSafeInteger(Number(row.variantOptionId)) ? Number(row.variantOptionId) : null,
      historicalVariantOptionId: row.variantOptionId != null && Number.isSafeInteger(Number(row.variantOptionId)) ? Number(row.variantOptionId) : null,
      updateCurrentStock: row.updateCurrentStock === true,
      stockApplied: row.stockApplied === true,
      sortOrder: index,
    };
  });
}

/** Replace all SupplyRecord rows for a supplier from SupplyDetail[] or JSON string. */
export async function replaceSupplierSupplyRecords(
  db: DbClient,
  supplierRefId: number,
  details: SupplyDetail[] | string | null | undefined,
): Promise<SupplyDetail[]> {
  const raw =
    typeof details === 'string'
      ? parseSuppliesJsonCompat(details)
      : Array.isArray(details)
        ? details
        : [];
  // Collapse catalog-linked duplicate summaries before any persistence. History
  // rows are deliberately retained as separate dated events.
  let list = raw.filter((row) => !isSupplyDeleteMarker(row));
  // Resolve legacy rows against the distributor's current catalog. Only unique or
  // verified matches are linked; unmatched/ambiguous rows retain their original data.
  const supplierOwner = await db.supplier.findUnique({
    where: { id: supplierRefId },
    select: { userId: true },
  });
  if (supplierOwner?.userId != null) {
    for (const row of list) {
      if (row.variantOptionId != null) continue;
      const resolved = await resolveCatalogIdentity(db, supplierOwner.userId, {
        productId: row.productId, productName: row.product, variantName: row.variantName, sku: row.sku,
      });
      if (resolved.status === 'matched') {
        row.variantOptionId = resolved.candidate.variantOptionId;
        row.productId = resolved.candidate.productId;
        row.variantName = row.variantName || resolved.candidate.variantName;
        row.sku = row.sku || resolved.candidate.sku || '';
      }
    }
  }

  // Preserve database IDs for unchanged/edited records. The caller must hold the
  // distributor advisory lock in the same transaction for existing suppliers.
  list = mergeDuplicateSummaryRows(list);
  const incoming = buildSupplyRecordCreateManyRows(supplierRefId, list);
  // Guard the same identity used by the UI: one row per catalog product + SKU.
  // If a row has no SKU, fall back to the product's variant label.
  const summaryKeys = new Set<string>();
  for (const row of incoming) {
    if (row.recordType !== 'summary') continue;
    const productId = String(row.productId || '').trim().toLowerCase();
    const sku = String(row.sku || '').trim().toLowerCase();
    const variant = String(row.variantName || row.product || '').trim().toLowerCase();
    const variantOptionId = row.variantOptionId == null ? '' : String(row.variantOptionId);
    const key = variantOptionId
      ? `variant-option:${variantOptionId}`
      : productId
      ? (sku ? `${productId}|sku:${sku}` : `${productId}|variant:${variant}`)
      : (sku ? `sku:${sku}|product:${String(row.product || '').trim().toLowerCase()}` : `product:${variant}`);
    if (summaryKeys.has(key)) {
      throw new Error('Duplicate supply summary for the same product and SKU. Reconcile before saving.');
    }
    summaryKeys.add(key);
  }
  // A supplier snapshot may refer to a variant removed during this same product
  // update. Such an ID is historical data, NOT a valid live foreign key.
  const requestedIds = [...new Set(incoming.map((row) => row.variantOptionId).filter((id): id is number => id != null))];
  const liveVariants = requestedIds.length
    ? await db.variantOption.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true },
      })
    : [];
  const liveIds = new Set(liveVariants.map((variant) => variant.id));
  for (const row of incoming) {
    const requestedId = row.variantOptionId;
    if (requestedId != null) {
      row.historicalVariantOptionId = requestedId;
      if (!liveIds.has(requestedId)) row.variantOptionId = null;
    }
  }
  const existing = await db.supplyRecord.findMany({ where: { supplierRefId } });
  const byNo = new Map<string, typeof existing>();
  for (const row of existing) {
    if (!row.suppliesno) continue;
    const group = byNo.get(row.suppliesno) || [];
    group.push(row);
    byNo.set(row.suppliesno, group);
  }
  const used = new Set<number>();
  const seen = new Set<string>();
  for (const row of incoming) {
    // Identical IDs in one payload would make updates ambiguous and unsafe.
    if (row.suppliesno) {
      if (seen.has(row.suppliesno)) {
        throw new Error('Duplicate supply record number. Please correct the supplier history.');
      }
      seen.add(row.suppliesno);
    }
    const matches = row.suppliesno ? byNo.get(row.suppliesno) || [] : [];
    if (matches.length > 1) {
      throw new Error('Duplicate stored supply record number. Reconcile before saving.');
    }
    const match = matches[0];
    if (match) {
      // An existing snapshot owns its original identity permanently. In particular,
      // do not attach it to a newly-created variant with the same label or SKU.
      const originalId = match.historicalVariantOptionId ?? match.variantOptionId;
      if (originalId != null) {
        row.historicalVariantOptionId = originalId;
        if (row.variantOptionId !== originalId) row.variantOptionId = null;
      }
      used.add(match.id);
      await db.supplyRecord.update({
        where: { id: match.id },
        data: {
          suppliesno: row.suppliesno,
          sku: row.sku,
          product: row.product,
          receivedQuantity: row.receivedQuantity,
          receivedUnit: row.receivedUnit,
          totalSupplied: row.totalSupplied,
          totalValue: row.totalValue,
          lastSuppliedDate: row.lastSuppliedDate,
          status: row.status,
          deliverySuccess: row.deliverySuccess,
          recordType: row.recordType,
          productId: row.productId,
          variantName: row.variantName,
          variantOptionId: row.variantOptionId,
          historicalVariantOptionId: row.historicalVariantOptionId,
          updateCurrentStock: row.updateCurrentStock,
          stockApplied: row.stockApplied,
          sortOrder: row.sortOrder,
        },
      });
    } else {
      const created = await db.supplyRecord.create({ data: row });
      used.add(created.id);
    }
  }
  const removedIds = existing.filter((row) => !used.has(row.id)).map((row) => row.id);
  if (removedIds.length) {
    await db.supplyRecord.deleteMany({ where: { supplierRefId, id: { in: removedIds } } });
  }

  return list;
}
