import type { Prisma, PrismaClient } from '@/lib/prisma-generated';
import type { SupplyDetail } from '@/types/client';
import { getSupplyRecordType } from '@/lib/suppliers/supplyRecords';
import { isSupplyDeleteMarker } from '@/lib/suppliers/applySupplierSuppliesSave';

type DbClient = PrismaClient | Prisma.TransactionClient;

export type SupplyRecordRow = {
  suppliesno: string;
  sku: string;
  product: string;
  totalSupplied: string;
  totalValue: string;
  lastDelivery: string;
  status: string;
  deliverySuccess: string | null;
  recordType: string;
  productId: string | null;
  variantName: string | null;
  updateCurrentStock: boolean;
  stockApplied: boolean;
  sortOrder: number;
};

export function parseSuppliesJsonCompat(raw: string | null | undefined): SupplyDetail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SupplyDetail[]) : [];
  } catch {
    return [];
  }
}

export function supplyDetailFromRecord(row: SupplyRecordRow): SupplyDetail {
  return {
    suppliesno: row.suppliesno || '',
    sku: row.sku || '',
    product: row.product || '',
    totalSupplied: row.totalSupplied || '',
    totalValue: row.totalValue || '',
    lastDelivery: row.lastDelivery || '',
    status: row.status || 'Active',
    deliverySuccess: row.deliverySuccess || undefined,
    recordType: row.recordType === 'summary' ? 'summary' : 'history',
    productId: row.productId || undefined,
    variantName: row.variantName || undefined,
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
  totalSupplied: string;
  totalValue: string;
  lastDelivery: string;
  status: string;
  deliverySuccess: string | null;
  recordType: string;
  productId: string | null;
  variantName: string | null;
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
    return {
      supplierRefId,
      suppliesno: String(row.suppliesno || ''),
      sku: String(row.sku || ''),
      product: String(row.product || ''),
      totalSupplied: String(row.totalSupplied || ''),
      totalValue: String(row.totalValue || ''),
      lastDelivery: String(row.lastDelivery || ''),
      status: String(row.status || 'Active'),
      deliverySuccess: row.deliverySuccess != null ? String(row.deliverySuccess) : null,
      recordType,
      productId: row.productId ? String(row.productId) : null,
      variantName: row.variantName ? String(row.variantName) : null,
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
  const list = raw.filter((row) => !isSupplyDeleteMarker(row));

  await db.supplyRecord.deleteMany({ where: { supplierRefId } });

  if (list.length === 0) return [];

  await db.supplyRecord.createMany({
    data: buildSupplyRecordCreateManyRows(supplierRefId, list),
  });

  return list;
}
