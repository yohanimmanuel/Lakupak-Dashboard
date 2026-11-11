import type { Prisma, PrismaClient } from '@/lib/prisma-generated';
import type { OrderDetail } from '@/types/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

/** Namespace key for pg_advisory_xact_lock(key1, buyerRefId) — buyer order-record replaces. */
export const BUYER_RECORDS_ADVISORY_KEY = 879_450;

/** Acquire the buyer-records advisory lock (same order as syncOrderToBuyerProfile). */
export async function lockBuyerOrderRecords(
  tx: DbClient,
  buyerRefId: number,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BUYER_RECORDS_ADVISORY_KEY}, ${buyerRefId})`;
}

export type BuyerRecordRow = {
  orderNo: string;
  product: string;
  totalOrders: string;
  totalSpend: string;
  shippingFee: string | null;
  lastOrderDate: string;
  outstanding: string;
  freeItems: number | null;
  discountBadge: string | null;
  offerApplied: boolean | null;
  syncedFromOrders: boolean;
  sortOrder: number;
};

export type ReplaceBuyerOrderRecordsResult = {
  records: OrderDetail[];
  /** False when stored rows already matched — IDs and updatedAt are preserved. */
  changed: boolean;
};

export function parseOrderDetailsJson(raw: string | null | undefined): OrderDetail[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OrderDetail[]) : [];
  } catch {
    return [];
  }
}

export function orderDetailFromRecord(row: BuyerRecordRow): OrderDetail {
  return {
    orderNo: row.orderNo || '',
    product: row.product || '',
    totalOrders: row.totalOrders || '',
    totalSpend: row.totalSpend || '',
    shippingFee: row.shippingFee || undefined,
    lastOrderDate: row.lastOrderDate || '',
    outstanding: row.outstanding || '',
    freeItems: row.freeItems ?? undefined,
    discountBadge: row.discountBadge || undefined,
    offerApplied: row.offerApplied ?? undefined,
    syncedFromOrders: row.syncedFromOrders || undefined,
  };
}

export function serializeBuyerRecords(rows: BuyerRecordRow[]): string {
  return JSON.stringify(rows.map(orderDetailFromRecord));
}

function normalizeFreeItems(value: unknown): number | null {
  if (value == null) return null;
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : null;
}

function normalizeBuyerRecordForCompare(row: OrderDetail, index: number): BuyerRecordRow {
  return {
    orderNo: String(row.orderNo || ''),
    product: String(row.product || ''),
    totalOrders: String(row.totalOrders || ''),
    totalSpend: String(row.totalSpend || ''),
    shippingFee: row.shippingFee != null ? String(row.shippingFee) : null,
    lastOrderDate: String(row.lastOrderDate || ''),
    outstanding: String(row.outstanding || ''),
    freeItems: normalizeFreeItems(row.freeItems),
    discountBadge: row.discountBadge != null ? String(row.discountBadge) : null,
    offerApplied: typeof row.offerApplied === 'boolean' ? row.offerApplied : null,
    syncedFromOrders: row.syncedFromOrders === true,
    sortOrder: index,
  };
}

/** Flatten order-detail payload into BuyerRecord createMany rows (empty → []). */
export function buildBuyerRecordCreateManyRows(
  buyerRefId: number,
  details: OrderDetail[] | string | null | undefined,
): Array<BuyerRecordRow & { buyerRefId: number }> {
  const list =
    typeof details === 'string'
      ? parseOrderDetailsJson(details)
      : Array.isArray(details)
        ? details
        : [];
  if (list.length === 0) return [];
  return list.map((row, index) => ({
    buyerRefId,
    ...normalizeBuyerRecordForCompare(row, index),
  }));
}

export function areBuyerOrderDetailsEqual(
  left: OrderDetail[],
  right: OrderDetail[],
): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = normalizeBuyerRecordForCompare(left[i], i);
    const b = normalizeBuyerRecordForCompare(right[i], i);
    if (
      a.orderNo !== b.orderNo ||
      a.product !== b.product ||
      a.totalOrders !== b.totalOrders ||
      a.totalSpend !== b.totalSpend ||
      a.shippingFee !== b.shippingFee ||
      a.lastOrderDate !== b.lastOrderDate ||
      a.outstanding !== b.outstanding ||
      a.freeItems !== b.freeItems ||
      a.discountBadge !== b.discountBadge ||
      a.offerApplied !== b.offerApplied ||
      a.syncedFromOrders !== b.syncedFromOrders ||
      a.sortOrder !== b.sortOrder
    ) {
      return false;
    }
  }
  return true;
}

export async function loadBuyerOrderDetails(
  db: DbClient,
  buyerRefId: number,
): Promise<OrderDetail[]> {
  const rows = await db.buyerRecord.findMany({
    where: { buyerRefId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map(orderDetailFromRecord);
}

export async function loadBuyerOrderDetailsJson(
  db: DbClient,
  buyerRefId: number,
): Promise<string | null> {
  const rows = await db.buyerRecord.findMany({
    where: { buyerRefId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  if (rows.length > 0) return serializeBuyerRecords(rows);
  return null;
}

async function replaceBuyerOrderRecordsInTx(
  tx: DbClient,
  buyerRefId: number,
  list: OrderDetail[],
): Promise<ReplaceBuyerOrderRecordsResult> {
  await lockBuyerOrderRecords(tx, buyerRefId);

  const existing = await loadBuyerOrderDetails(tx, buyerRefId);
  if (areBuyerOrderDetailsEqual(existing, list)) {
    return { records: existing, changed: false };
  }

  await tx.buyerRecord.deleteMany({ where: { buyerRefId } });

  if (list.length === 0) {
    return { records: [], changed: true };
  }

  await tx.buyerRecord.createMany({
    data: list.map((row, index) => {
      const normalized = normalizeBuyerRecordForCompare(row, index);
      return {
        buyerRefId,
        ...normalized,
      };
    }),
  });

  return { records: list, changed: true };
}

/**
 * Replace all BuyerRecord rows for a buyer from an OrderDetail[] or JSON string.
 * Concurrent replaces for the same buyer are serialized with pg_advisory_xact_lock.
 * When the payload matches stored rows, the write is skipped so IDs/updatedAt stay put.
 */
export async function replaceBuyerOrderRecords(
  db: DbClient,
  buyerRefId: number,
  details: OrderDetail[] | string | null | undefined,
): Promise<ReplaceBuyerOrderRecordsResult> {
  const list =
    typeof details === 'string'
      ? parseOrderDetailsJson(details)
      : Array.isArray(details)
        ? details
        : [];

  // Root Prisma client: own a transaction so the advisory lock covers delete+create.
  // Transaction clients: join the caller's transaction (e.g. buyer.update + records).
  if (typeof (db as PrismaClient).$transaction === 'function') {
    return (db as PrismaClient).$transaction(async (tx) =>
      replaceBuyerOrderRecordsInTx(tx, buyerRefId, list),
    );
  }

  return replaceBuyerOrderRecordsInTx(db, buyerRefId, list);
}
