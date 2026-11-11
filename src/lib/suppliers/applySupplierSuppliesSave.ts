import { prisma } from '@/lib/db';
import type { Prisma, PrismaClient } from '@/lib/prisma-generated';
import type { SupplyDetail } from '@/types/client';
import {
  applySummaryDelta,
  isSupplyHistoryRow,
  parseSuppliesJson,
  shouldUpdateCurrentStock,
  todayYmdJakarta,
} from '@/lib/suppliers/supplyRecords';

type DbClient = PrismaClient | Prisma.TransactionClient;

const toQty = (value: unknown): number => {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const toValue = (value: unknown): number => {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

export { todayYmdJakarta };

async function findVariantForSupply(args: {
  userId: number;
  sku?: string | null;
  productId?: string | null;
  variantName?: string | null;
  db?: DbClient;
}): Promise<{ id: number; stockQuantity: number } | null> {
  const db = args.db ?? prisma;
  const sku = String(args.sku || '').trim();
  const productId = String(args.productId || '').trim();
  const variantName = String(args.variantName || '').trim();

  if (productId) {
    const product = await db.product.findFirst({
      where: { userId: args.userId, productId },
      select: {
        variantOptions: {
          where: variantName ? { variantName, isActive: true } : { isActive: true },
          select: { id: true, variantName: true, sku: true, stockQuantity: true },
          take: 20,
        },
      },
    });
    if (product?.variantOptions?.length) {
      const byName = variantName
        ? product.variantOptions.find((v) => v.variantName === variantName)
        : undefined;
      if (byName) return byName;
      const bySku = sku
        ? product.variantOptions.find((v) => String(v.sku || '').trim() === sku)
        : undefined;
      if (bySku) return bySku;
      // Only fall back when the product has a single active variant.
      if (product.variantOptions.length === 1) return product.variantOptions[0];
      return null;
    }
  }

  if (sku) {
    return db.variantOption.findFirst({
      where: {
        sku,
        isActive: true,
        product: { userId: args.userId },
      },
      select: { id: true, stockQuantity: true },
    });
  }

  return null;
}

export async function incrementVariantStockForSupply(args: {
  userId: number;
  sku?: string | null;
  productId?: string | null;
  variantName?: string | null;
  quantity: number;
  db?: DbClient;
}): Promise<boolean> {
  const qty = Math.trunc(Number(args.quantity) || 0);
  if (qty === 0) return false;

  const db = args.db ?? prisma;
  const variant = await findVariantForSupply({ ...args, db });
  if (!variant) return false;

  // Atomic adjust + zero floor (avoids lost updates from read-then-write).
  const updated = await db.$executeRaw`
    UPDATE "VariantOption"
    SET "stockQuantity" = GREATEST(0, "stockQuantity" + ${qty})
    WHERE "id" = ${variant.id}
  `;
  return Number(updated) > 0;
}

export type SupplyStockEffect = {
  row: SupplyDetail;
  quantityDelta: number;
  valueDelta: number;
  reason: 'add' | 'edit' | 'delete' | 'enable' | 'disable';
  /**
   * When false, skip product stock. Defaults to true.
   * Unchecked Update Stock → false; checked → true.
   */
  applyStock?: boolean;
  /**
   * When false, skip summary/totals. Defaults to true.
   * Used when enabling/disabling Update Stock after totals were already applied.
   */
  applySummary?: boolean;
};

/** Stable identity for history rows that may lack suppliesno (legacy blank ids). */
function historyRowFingerprint(row: SupplyDetail): string {
  return [
    String(row.sku || '').trim().toLowerCase(),
    String(row.productId || '').trim().toLowerCase(),
    String(row.variantName || '').trim().toLowerCase(),
    String(row.product || '').trim().toLowerCase(),
    String(row.lastDelivery || '').trim(),
    String(row.totalSupplied || '').trim(),
    String(row.totalValue || '').trim(),
  ].join('|');
}

type PreviousHistoryIndexes = {
  previousById: Map<string, SupplyDetail>;
  /** Blank-id previous rows only — never steal an id-keyed match. */
  previousByFingerprint: Map<string, SupplyDetail>;
};

function buildPreviousHistoryIndexes(previousHistory: SupplyDetail[]): PreviousHistoryIndexes {
  const previousById = new Map<string, SupplyDetail>();
  const previousByFingerprint = new Map<string, SupplyDetail>();
  for (const row of previousHistory) {
    const id = String(row.suppliesno || '').trim();
    if (id) {
      previousById.set(id, row);
      continue;
    }
    const fp = historyRowFingerprint(row);
    if (fp.replace(/\|/g, '') && !previousByFingerprint.has(fp)) {
      previousByFingerprint.set(fp, row);
    }
  }
  return { previousById, previousByFingerprint };
}

/**
 * Match incoming history to previous: suppliesno first, then fingerprint against
 * unmatched blank-id previous rows. Each previous row is claimed at most once.
 */
function matchPreviousHistoryRow(
  row: SupplyDetail,
  indexes: PreviousHistoryIndexes,
  matchedPrevious: Set<SupplyDetail>,
): SupplyDetail | undefined {
  const id = String(row.suppliesno || '').trim();
  const fp = historyRowFingerprint(row);
  let prev: SupplyDetail | undefined;
  if (id) {
    prev = indexes.previousById.get(id);
    if (!prev && fp.replace(/\|/g, '')) {
      const candidate = indexes.previousByFingerprint.get(fp);
      if (candidate && !matchedPrevious.has(candidate)) prev = candidate;
    }
  } else if (fp.replace(/\|/g, '')) {
    const candidate = indexes.previousByFingerprint.get(fp);
    if (candidate && !matchedPrevious.has(candidate)) prev = candidate;
  }
  if (prev && matchedPrevious.has(prev)) prev = undefined;
  if (prev) matchedPrevious.add(prev);
  return prev;
}

/** Client tombstone: removed history row with explicit reverse-stock intent. */
export type SupplyDeleteMarker = SupplyDetail & { __delete: true };

export function isSupplyDeleteMarker(row: SupplyDetail): row is SupplyDeleteMarker {
  return (row as SupplyDeleteMarker).__delete === true;
}

export function splitSupplyDeleteMarkers(rows: SupplyDetail[]): {
  live: SupplyDetail[];
  deleteMarkers: SupplyDeleteMarker[];
} {
  const live: SupplyDetail[] = [];
  const deleteMarkers: SupplyDeleteMarker[] = [];
  for (const row of rows) {
    if (isSupplyDeleteMarker(row)) deleteMarkers.push(row);
    else live.push(row);
  }
  return { live, deleteMarkers };
}

/**
 * Compute stock/summary effects from checkbox-aware history diffs.
 * - Any new/edited history row updates totals (summary)
 * - Product stock updates only when Update Stock is checked
 * - First-time enable after totals-only save → stock only (no double totals)
 * - Disable (tick → untick) after stockApplied → reverse product stock only (totals stay)
 * - Re-enable after disable → apply stock only again (totals stay)
 * - Identity change while checked → move stock+totals; while unchecked → totals only
 * - Deleted rows (with __delete marker): always reverse totals; reverse product stock
 *   only when the marker has updateCurrentStock true
 * - Unmarked deletes never reverse stock or totals
 */
export function computeSupplyStockEffects(
  previous: SupplyDetail[],
  incoming: SupplyDetail[],
): SupplyStockEffect[] {
  const { live: liveIncoming, deleteMarkers } = splitSupplyDeleteMarkers(incoming);
  const deleteReverseByKey = new Map<string, boolean>();
  for (const marker of deleteMarkers) {
    const reverse = marker.updateCurrentStock === true;
    const id = String(marker.suppliesno || '').trim();
    if (id) deleteReverseByKey.set(`id:${id}`, reverse);
    const fp = historyRowFingerprint(marker);
    if (fp.replace(/\|/g, '')) deleteReverseByKey.set(`fp:${fp}`, reverse);
  }

  const previousHistory = previous.filter(isSupplyHistoryRow);
  const incomingHistory = liveIncoming.filter(isSupplyHistoryRow);
  const previousIndexes = buildPreviousHistoryIndexes(previousHistory);
  const matchedPrevious = new Set<SupplyDetail>();
  const effects: SupplyStockEffect[] = [];

  const pushIdentityMove = (
    from: SupplyDetail,
    to: SupplyDetail,
    toQtyValue: number,
    toValueAmount: number,
    applyStock: boolean,
  ) => {
    const prevQty = toQty(from.totalSupplied);
    const prevValue = toValue(from.totalValue);
    if (prevQty > 0 || prevValue > 0) {
      effects.push({
        row: from,
        quantityDelta: -prevQty,
        valueDelta: -prevValue,
        reason: 'edit',
        applyStock,
      });
    }
    if (toQtyValue > 0 || toValueAmount > 0) {
      effects.push({
        row: to,
        quantityDelta: toQtyValue,
        valueDelta: toValueAmount,
        reason: 'edit',
        applyStock,
      });
    }
  };

  for (const row of incomingHistory) {
    const prev = matchPreviousHistoryRow(row, previousIndexes, matchedPrevious);

    const qty = toQty(row.totalSupplied);
    const value = toValue(row.totalValue);
    const checked = shouldUpdateCurrentStock(row);
    const wasChecked = prev ? shouldUpdateCurrentStock(prev) : false;
    // Only the persisted server flag counts — never trust a client-invented stockApplied.
    const stockAlreadyApplied = prev?.stockApplied === true;

    if (!prev) {
      if (qty > 0 || value > 0) {
        effects.push({
          row,
          quantityDelta: qty,
          valueDelta: value,
          reason: 'add',
          applyStock: checked,
        });
      }
      continue;
    }

    const identityChanged =
      String(prev.sku || '').trim() !== String(row.sku || '').trim() ||
      String(prev.productId || '').trim() !== String(row.productId || '').trim() ||
      String(prev.variantName || '').trim() !== String(row.variantName || '').trim();

    // Flip off → on: apply product stock only (totals already counted).
    if (!wasChecked && checked && (qty > 0 || value > 0)) {
      if (stockAlreadyApplied) {
        // Legacy: stock flag still set without a disable reverse — qty deltas only.
        const quantityDelta = qty - toQty(prev.totalSupplied);
        const valueDelta = value - toValue(prev.totalValue);
        if (quantityDelta !== 0 || valueDelta !== 0) {
          effects.push({
            row,
            quantityDelta,
            valueDelta,
            reason: 'edit',
            applyStock: true,
          });
        }
      } else {
        effects.push({
          row,
          quantityDelta: qty,
          valueDelta: value,
          reason: 'enable',
          applyStock: true,
          applySummary: false,
        });
        const quantityDelta = qty - toQty(prev.totalSupplied);
        const valueDelta = value - toValue(prev.totalValue);
        if (quantityDelta !== 0 || valueDelta !== 0) {
          effects.push({
            row,
            quantityDelta,
            valueDelta,
            reason: 'edit',
            applyStock: false,
          });
        }
      }
      continue;
    }

    // Flip on → off: reverse product stock only (totals stay with the history row).
    if (wasChecked && !checked) {
      const prevQty = toQty(prev.totalSupplied);
      const prevValue = toValue(prev.totalValue);
      if (stockAlreadyApplied && (prevQty > 0 || prevValue > 0)) {
        effects.push({
          row: prev,
          quantityDelta: -prevQty,
          valueDelta: -prevValue,
          reason: 'disable',
          applyStock: true,
          applySummary: false,
        });
      }
      // Totals still follow qty/value/identity edits on the row.
      if (identityChanged) {
        const newIdentified =
          Boolean(String(row.sku || '').trim()) || Boolean(String(row.productId || '').trim());
        if (newIdentified) {
          pushIdentityMove(prev, row, qty, value, false);
        }
      } else {
        const quantityDelta = qty - prevQty;
        const valueDelta = value - prevValue;
        if (quantityDelta !== 0 || valueDelta !== 0) {
          effects.push({
            row,
            quantityDelta,
            valueDelta,
            reason: 'edit',
            applyStock: false,
          });
        }
      }
      continue;
    }

    // Stay checked: stock + totals.
    if (checked && wasChecked) {
      if (identityChanged) {
        const newIdentified =
          Boolean(String(row.sku || '').trim()) || Boolean(String(row.productId || '').trim());
        if (!newIdentified) continue;
        pushIdentityMove(prev, row, qty, value, true);
        continue;
      }

      const quantityDelta = qty - toQty(prev.totalSupplied);
      const valueDelta = value - toValue(prev.totalValue);
      if (quantityDelta !== 0 || valueDelta !== 0) {
        effects.push({
          row,
          quantityDelta,
          valueDelta,
          reason: 'edit',
          applyStock: true,
        });
      }
      continue;
    }

    // Stay unchecked: totals only.
    if (!checked) {
      if (identityChanged) {
        const newIdentified =
          Boolean(String(row.sku || '').trim()) || Boolean(String(row.productId || '').trim());
        if (!newIdentified) continue;
        pushIdentityMove(prev, row, qty, value, false);
        continue;
      }

      const quantityDelta = qty - toQty(prev.totalSupplied);
      const valueDelta = value - toValue(prev.totalValue);
      if (quantityDelta !== 0 || valueDelta !== 0) {
        effects.push({
          row,
          quantityDelta,
          valueDelta,
          reason: 'edit',
          applyStock: false,
        });
      }
    }
  }

  // Deleted history rows → reverse only when delete intent says so.
  // Survival is solely from matchedPrevious so duplicate rows are handled independently.
  for (const prev of previousHistory) {
    if (matchedPrevious.has(prev)) continue;
    const id = String(prev.suppliesno || '').trim();
    const fp = historyRowFingerprint(prev);

    const intent =
      (id ? deleteReverseByKey.get(`id:${id}`) : undefined) ??
      (fp.replace(/\|/g, '') ? deleteReverseByKey.get(`fp:${fp}`) : undefined);
    // Require an explicit delete marker from the modal.
    if (intent === undefined) continue;

    const qty = toQty(prev.totalSupplied);
    const value = toValue(prev.totalValue);
    if (qty <= 0 && value <= 0) continue;

    // Totals always reverse on delete. Product stock only when Update Stock is checked
    // and this row previously contributed to stock.
    const previouslyApplied = prev.stockApplied === true || shouldUpdateCurrentStock(prev);
    effects.push({
      row: prev,
      quantityDelta: -qty,
      valueDelta: -value,
      reason: 'delete',
      applyStock: intent === true && previouslyApplied,
    });
  }

  return effects;
}

/** @deprecated Prefer computeSupplyStockEffects — kept for older unit tests. */
export function diffHistorySupplyEvents(
  previous: SupplyDetail[],
  incoming: SupplyDetail[],
): Array<{ row: SupplyDetail; quantityDelta: number; valueDelta: number }> {
  return computeSupplyStockEffects(previous, incoming).map((effect) => ({
    row: effect.row,
    quantityDelta: effect.quantityDelta,
    valueDelta: effect.valueDelta,
  }));
}

/**
 * When supplier supplies JSON is replaced from the edit page:
 * apply checkbox-driven stock + summary deltas (including delete reversals).
 */
export async function finalizeSupplierSuppliesSave(args: {
  userId: number;
  previousSuppliesRaw: string | null | undefined;
  nextSuppliesRaw: string | null | undefined;
  /** When set, stock updates participate in the caller's transaction. */
  db?: DbClient;
}): Promise<{ suppliesJson: string; stockUpdatedCount: number; effectCount: number }> {
  const previous = parseSuppliesJson(args.previousSuppliesRaw);
  const parsedIncoming = parseSuppliesJson(args.nextSuppliesRaw);
  const { live: incoming } = splitSupplyDeleteMarkers(parsedIncoming);
  const effects = computeSupplyStockEffects(previous, parsedIncoming);

  const effectRowKey = (row: SupplyDetail): string => {
    const id = String(row.suppliesno || '').trim();
    if (id) return `id:${id}`;
    return `fp:${historyRowFingerprint(row)}`;
  };

  // Apply stock first and record which effect rows actually changed product stock.
  const successfulStockApplyKeys = new Set<string>();
  let stockUpdatedCount = 0;
  for (const effect of effects) {
    if (effect.quantityDelta === 0) continue;
    if (effect.applyStock === false) continue;
    const updated = await incrementVariantStockForSupply({
      userId: args.userId,
      sku: effect.row.sku,
      productId: effect.row.productId,
      variantName: effect.row.variantName,
      quantity: effect.quantityDelta,
      db: args.db,
    });
    if (!updated) continue;
    stockUpdatedCount += 1;
    if (effect.reason === 'add' || effect.reason === 'enable' || effect.reason === 'edit') {
      successfulStockApplyKeys.add(effectRowKey(effect.row));
    }
  }

  const previousIndexes = buildPreviousHistoryIndexes(previous.filter(isSupplyHistoryRow));
  const matchedPrevious = new Set<SupplyDetail>();
  // Persist updateCurrentStock + stockApplied from successful stock updates (not intent).
  // Delete markers are never persisted. Disable still clears stockApplied.
  let supplies = incoming.map((row) => {
    if (!isSupplyHistoryRow(row)) return { ...row };
    const id = String(row.suppliesno || '').trim();
    const fp = historyRowFingerprint(row);
    const prev = matchPreviousHistoryRow(row, previousIndexes, matchedPrevious);
    const rowMatchesEffect = (effect: SupplyStockEffect) =>
      id
        ? String(effect.row.suppliesno || '').trim() === id
        : effect.row === row || historyRowFingerprint(effect.row) === fp;

    const disabledThisSave = effects.some(
      (effect) => effect.reason === 'disable' && rowMatchesEffect(effect),
    );
    const stockAppliedThisSave =
      successfulStockApplyKeys.has(effectRowKey(row)) ||
      // Enable/edit effects may key off the previous blank-id row.
      (prev ? successfulStockApplyKeys.has(effectRowKey(prev)) : false);
    const stockApplied = disabledThisSave
      ? false
      : stockAppliedThisSave || prev?.stockApplied === true;
    return {
      ...row,
      recordType: 'history' as const,
      updateCurrentStock: row.updateCurrentStock === true,
      stockApplied,
    };
  });
  for (const effect of effects) {
    if (effect.applySummary === false) continue;
    supplies = applySummaryDelta(supplies, {
      sku: String(effect.row.sku || '').trim(),
      product: String(effect.row.product || '').trim(),
      quantity: effect.quantityDelta,
      totalValue: effect.valueDelta,
      productId: String(effect.row.productId || '').trim() || undefined,
      variantName: String(effect.row.variantName || '').trim() || undefined,
      status: effect.row.status,
    });
  }

  return {
    suppliesJson: JSON.stringify(supplies),
    stockUpdatedCount,
    effectCount: effects.length,
  };
}
