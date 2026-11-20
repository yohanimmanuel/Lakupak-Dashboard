import { prisma } from '@/lib/db';
import type { Prisma, PrismaClient } from '@/lib/prisma-generated';
import type { SupplyDetail } from '@/types/client';
import {
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
  variantOptionId?: number | null;
  sku?: string | null;
  productId?: string | null;
  variantName?: string | null;
  /** Reversals may target an inactive but still-existing original variant. */
  allowInactive?: boolean;
  db?: DbClient;
}): Promise<{ id: number; stockQuantity: number } | null> {
  const db = args.db ?? prisma;
  // An explicit variant identity is authoritative, including when archived.
  // Never fall back to a reused SKU/name if the original variant is gone.
  if (args.variantOptionId != null) {
    const id = Number(args.variantOptionId);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return db.variantOption.findFirst({
      where: {
        id,
        ...(args.allowInactive ? {} : { isActive: true }),
        product: { userId: args.userId },
      },
      select: { id: true, stockQuantity: true },
    });
  }
  // An ID-less legacy receipt must be explicitly reconciled before it may
  // affect live inventory. Neither a product name nor a shared SKU is identity.

  return null;
}

export async function incrementVariantStockForSupply(args: {
  userId: number;
  variantOptionId?: number | null;
  sku?: string | null;
  productId?: string | null;
  variantName?: string | null;
  quantity: number;
  /** Allow a stock reversal against an inactive variant that still exists. */
  allowInactive?: boolean;
  db?: DbClient;
}): Promise<boolean> {
  const qty = Math.trunc(Number(args.quantity) || 0);
  if (qty === 0) return false;

  const db = args.db ?? prisma;
  const variant = await findVariantForSupply({ ...args, db, allowInactive: args.allowInactive });
  if (!variant) return false;

  // An exact reversal must never silently clamp to zero.
  const updated = await db.$executeRaw`
    UPDATE "VariantOption"
    SET "stockQuantity" = "stockQuantity" + ${qty}
    WHERE "id" = ${variant.id}
      AND "stockQuantity" + ${qty} >= 0
  `;
  if (Number(updated) !== 1) {
    throw new Error('Cannot reverse supplier stock: insufficient current stock for this variant.');
  }
  return true;
}

export type SupplyStockEffect = {
  row: SupplyDetail;
  /** Exact inventory target; old-side identity moves use the persisted applied target. */
  stockVariantOptionId?: number | null;
  /** Only an old-side reversal may be skipped when its original catalog row was deleted. */
  allowMissingVariant?: boolean;
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
    String(row.lastSuppliedDate || '').trim(),
    String(row.totalSupplied || '').trim(),
    String(row.totalValue || '').trim(),
  ].join('|');
}

type PreviousHistoryIndexes = {
  /** First previous row per suppliesno. */
  previousById: Map<string, SupplyDetail>;
  /**
   * Previous rows that cannot be found by id: blank ids, plus later rows that reuse an
   * id already taken (legacy imports wrote duplicate HIST-* ids). Never steals an id-keyed match.
   */
  previousByFingerprint: Map<string, SupplyDetail[]>;
};

function buildPreviousHistoryIndexes(previousHistory: SupplyDetail[]): PreviousHistoryIndexes {
  const previousById = new Map<string, SupplyDetail>();
  const previousByFingerprint = new Map<string, SupplyDetail[]>();
  for (const row of previousHistory) {
    const id = String(row.suppliesno || '').trim();
    if (id && !previousById.has(id)) {
      previousById.set(id, row);
      continue;
    }
    const fp = historyRowFingerprint(row);
    if (!fp.replace(/\|/g, '')) continue;
    const bucket = previousByFingerprint.get(fp);
    if (bucket) bucket.push(row);
    else previousByFingerprint.set(fp, [row]);
  }
  return { previousById, previousByFingerprint };
}

/**
 * Match incoming history to previous: suppliesno first, then fingerprint against
 * unmatched blank-id / duplicate-id previous rows. Each previous row is claimed at most once.
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
    const byId = indexes.previousById.get(id);
    if (byId && !matchedPrevious.has(byId)) prev = byId;
  }
  if (!prev && fp.replace(/\|/g, '')) {
    prev = indexes.previousByFingerprint
      .get(fp)
      ?.find((candidate) => !matchedPrevious.has(candidate));
  }
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
    const id = String(marker.suppliesno || '').trim();
    if (id) deleteReverseByKey.set(`id:${id}`, marker.updateCurrentStock === true);
    const fingerprint = historyRowFingerprint(marker);
    if (fingerprint.replace(/\\|/g, '')) {
      deleteReverseByKey.set(`fp:${fingerprint}`, marker.updateCurrentStock === true);
    }
  }

  const previousHistory = previous.filter(isSupplyHistoryRow);
  const incomingHistory = liveIncoming.filter(isSupplyHistoryRow);
  const previousIndexes = buildPreviousHistoryIndexes(previousHistory);
  const matchedPrevious = new Set<SupplyDetail>();
  const effects: SupplyStockEffect[] = [];

  const addEffect = (
    row: SupplyDetail,
    quantityDelta: number,
    valueDelta: number,
    reason: SupplyStockEffect['reason'],
    applyStock: boolean,
    stockVariantOptionId?: number | null,
    allowMissingVariant = false,
  ) => {
    if (quantityDelta === 0 && valueDelta === 0) return;
    effects.push({
      row,
      quantityDelta,
      valueDelta,
      reason,
      applyStock,
      stockVariantOptionId: stockVariantOptionId ?? row.variantOptionId ?? null,
      allowMissingVariant,
    });
  };

  for (const row of incomingHistory) {
    const prev = matchPreviousHistoryRow(row, previousIndexes, matchedPrevious);
    const quantity = toQty(row.totalSupplied);
    const value = toValue(row.totalValue);
    const checked = shouldUpdateCurrentStock(row);

    if (!prev) {
      if (quantity > 0 || value > 0) {
        addEffect(row, quantity, value, 'add', checked, row.variantOptionId);
      }
      continue;
    }

    const previousQuantity = toQty(prev.totalSupplied);
    const previousValue = toValue(prev.totalValue);
    const identityChanged =
      String(prev.variantOptionId ?? '') !== String(row.variantOptionId ?? '') ||
      String(prev.sku || '').trim() !== String(row.sku || '').trim() ||
      String(prev.productId || '').trim() !== String(row.productId || '').trim() ||
      String(prev.variantName || '').trim() !== String(row.variantName || '').trim();
    const previouslyApplied = prev.stockApplied === true;
    const previousMovementVariantId =
      prev.stockAppliedVariantOptionId ?? prev.variantOptionId ?? null;

    // The persisted flag is the authoritative record of a real inventory movement.
    // Checkbox intent alone must never cause a reversal of stock that was not applied.
    if (previouslyApplied && (!checked || identityChanged)) {
      if (previousQuantity > 0) {
        addEffect(
          prev,
          -previousQuantity,
          -previousValue,
          checked ? 'edit' : 'disable',
          true,
          previousMovementVariantId,
          true,
        );
      }
    }

    if (checked) {
      if (!previouslyApplied || identityChanged) {
        // No prior movement exists (or the receipt is being deliberately reassigned):
        // apply the complete new quantity to the explicitly selected live variant.
        if (quantity > 0) {
          addEffect(row, quantity, value, previouslyApplied ? 'edit' : 'enable', true, row.variantOptionId);
        }
        // Record value/quantity edits as receipt changes only; there is no separate
        // summary ledger in the receipt-only architecture.
      } else {
        // Same live identity and a movement already exists: apply only the delta.
        const quantityDelta = quantity - previousQuantity;
        const valueDelta = value - previousValue;
        if (quantityDelta !== 0 || valueDelta !== 0) {
          addEffect(
            row,
            quantityDelta,
            valueDelta,
            'edit',
            quantityDelta !== 0,
            previousMovementVariantId,
            quantityDelta < 0,
          );
        }
      }
    } else if (!previouslyApplied) {
      // Totals/history-only edits do not touch Product Catalog stock.
      if (identityChanged) {
        addEffect(prev, -previousQuantity, -previousValue, 'edit', false, null);
        addEffect(row, quantity, value, 'edit', false, row.variantOptionId);
      } else {
        addEffect(row, quantity - previousQuantity, value - previousValue, 'edit', false, row.variantOptionId);
      }
    } else if (!identityChanged) {
      // The previous movement was reversed above. Receipt edits remain history-only.
      addEffect(row, quantity - previousQuantity, value - previousValue, 'edit', false, row.variantOptionId);
    } else {
      // Previous movement was reversed above; the newly selected receipt is unchecked.
      addEffect(row, quantity, value, 'edit', false, row.variantOptionId);
    }
  }

  // Explicit delete markers remove the receipt. Reverse stock only if it was
  // actually applied and the user opted into reversal in the delete confirmation.
  for (const prev of previousHistory) {
    if (matchedPrevious.has(prev)) continue;
    const id = String(prev.suppliesno || '').trim();
    const fingerprint = historyRowFingerprint(prev);
    const intent =
      (id ? deleteReverseByKey.get(`id:${id}`) : undefined) ??
      (fingerprint.replace(/\\|/g, '') ? deleteReverseByKey.get(`fp:${fingerprint}`) : undefined);
    if (intent === undefined) continue;

    const quantity = toQty(prev.totalSupplied);
    const value = toValue(prev.totalValue);
    if (quantity <= 0 && value <= 0) continue;

    const previouslyApplied = prev.stockApplied === true;
    addEffect(
      prev,
      -quantity,
      -value,
      'delete',
      intent && previouslyApplied,
      prev.stockAppliedVariantOptionId ?? prev.variantOptionId ?? null,
      true,
    );
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
  const successfulStockApplyTargets = new Map<string, number>();
  let stockUpdatedCount = 0;
  for (const effect of effects) {
    if (effect.quantityDelta === 0) continue;
    if (effect.applyStock === false) continue;
    const updated = await incrementVariantStockForSupply({
      userId: args.userId,
      variantOptionId: effect.stockVariantOptionId ?? effect.row.variantOptionId,
      sku: effect.row.sku,
      productId: effect.row.productId,
      variantName: effect.row.variantName,
      quantity: effect.quantityDelta,
      allowInactive: effect.quantityDelta < 0,
      db: args.db,
    });
    if (!updated) {
      // A reversal for a variant deleted from the catalog has no remaining
      // inventory row to adjust. Never redirect it to a same-SKU replacement.
      if (effect.quantityDelta < 0 && effect.allowMissingVariant) continue;
      throw new Error('Supply stock update blocked for receipt ' + (effect.row.suppliesno || '(new)') + ': selected variant ' + (effect.stockVariantOptionId ?? effect.row.variantOptionId ?? '(missing ID)') + ' does not exist for this inventory movement.');
    }
    stockUpdatedCount += 1;
    if ((effect.reason === 'add' || effect.reason === 'enable' || effect.reason === 'edit') && effect.stockVariantOptionId != null) {
      successfulStockApplyTargets.set(effectRowKey(effect.row), effect.stockVariantOptionId);
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
    const appliedTargetThisSave =
      successfulStockApplyTargets.get(effectRowKey(row)) ??
      (prev ? successfulStockApplyTargets.get(effectRowKey(prev)) : undefined);
    const stockAppliedThisSave = appliedTargetThisSave != null;
    const stockApplied = disabledThisSave
      ? false
      : stockAppliedThisSave || prev?.stockApplied === true;
    return {
      ...row,
      recordType: 'history' as const,
      updateCurrentStock: row.updateCurrentStock === true,
      stockApplied,
      stockAppliedVariantOptionId: disabledThisSave
        ? null
        : appliedTargetThisSave ?? (prev?.stockApplied ? prev.stockAppliedVariantOptionId ?? prev.variantOptionId ?? null : null),
    };
  });
  // Keep the AUTO rows as product-stock snapshots. They are deliberately not
  // incremented when a HIST receipt is saved: buildSupplySummaryFromHistory()
  // derives the visible total from the current Product stock + non-applied HIST
  // rows. This prevents save/reload cycles from accumulating the same receipt.
  const previousSummaryRows = previous.filter((row) => !isSupplyHistoryRow(row));
  // Legacy opening balances are retained but are no longer recalculated or
  // treated as receipts. New supplier accounting consists only of history.
  supplies = [...previousSummaryRows, ...supplies.filter(isSupplyHistoryRow)];

  return {
    suppliesJson: JSON.stringify(supplies),
    stockUpdatedCount,
    effectCount: effects.length,
  };
}
