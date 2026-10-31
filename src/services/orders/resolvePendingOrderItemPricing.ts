import { prisma, type Prisma } from '@/lib/db';
import {
  applyOfferToPrice,
  getOfferForClientAndProduct,
  type ResolvedOffer,
} from '@/lib/offers/getOfferForClientAndProduct';
import { parsePrice } from '@/utils/currencyUtils';
import { calculateOrderTotalAmount } from '@/utils/orderCalculations';
import type { Order } from '@/types/order';
import { decimalToNumber } from './utils';

function pickVariantOption<
  T extends { id: number; isDefault: boolean; sellingPrice: unknown },
>(options: T[], variantOptionId: number | null | undefined): T | null {
  if (!options.length) return null;
  return (
    (variantOptionId
      ? options.find((vo) => vo.id === variantOptionId)
      : null) ||
    options.find((vo) => vo.isDefault) ||
    options[0] ||
    null
  );
}

function buildOfferSnapshots(
  baseUnitPrice: number,
  offer: ResolvedOffer | null,
  moq: number | null,
): {
  unitPrice: number;
  offerApplied: boolean;
  offerBadgeSnapshot: string | null;
  offerNameSnapshot: string | null;
  offerIdSnapshot: string | null;
  originalPriceSnapshot: string | null;
  discountAmount: number | null;
  discountPercentage: number | null;
  promotionDetailsSnapshot: string | null;
} {
  if (!offer) {
    return {
      unitPrice: Math.max(0, baseUnitPrice),
      offerApplied: false,
      offerBadgeSnapshot: null,
      offerNameSnapshot: null,
      offerIdSnapshot: null,
      originalPriceSnapshot: null,
      discountAmount: null,
      discountPercentage: null,
      promotionDetailsSnapshot: null,
    };
  }

  const applied = applyOfferToPrice(baseUnitPrice, offer);
  const hasPromoOnly =
    offer.discountType === 'buy_x_get_y' ||
    (Boolean(applied.promotionDetails) && !(applied.discountAmount > 0));

  // Only persist % when the offer itself is percentage — fixed_amount keeps amount only.
  const discountPercentage =
    offer.discountType === 'percentage' ? applied.discountPercentage : null;
  const discountAmount =
    offer.discountType === 'percentage' ||
    offer.discountType === 'fixed_amount'
      ? applied.discountAmount
      : applied.discountAmount > 0
        ? applied.discountAmount
        : null;

  return {
    unitPrice: Math.max(0, applied.unitPrice),
    offerApplied: true,
    offerBadgeSnapshot: hasPromoOnly ? 'Promotion' : 'Discount',
    offerNameSnapshot: offer.notes || offer.description || 'Client offer',
    offerIdSnapshot: offer.id,
    originalPriceSnapshot: String(baseUnitPrice),
    discountAmount: discountAmount && discountAmount > 0 ? discountAmount : null,
    discountPercentage:
      discountPercentage != null && discountPercentage > 0 ? discountPercentage : null,
    promotionDetailsSnapshot: applied.promotionDetails
      ? JSON.stringify({
          minQuantity: applied.promotionDetails.buyQuantity,
          freeQuantity: applied.promotionDetails.freeQuantity,
          applyMode: applied.promotionDetails.applyMode,
          moq: moq != null && moq > 0 ? moq : null,
        })
      : null,
  };
}

export type PendingOrderPriceUpdate = {
  id: number;
  pricePerPackage: number;
  subtotal: number;
  unitPriceSnapshot: number;
  offerApplied: boolean;
  offerBadgeSnapshot: string | null;
  offerNameSnapshot: string | null;
  offerIdSnapshot: string | null;
  originalPriceSnapshot: string | null;
  discountAmount: number | null;
  discountPercentage: number | null;
  promotionDetailsSnapshot: string | null;
};

export type PendingOrderPricePreview = {
  updates: PendingOrderPriceUpdate[];
  subtotal: number;
  totalAmount: number;
  anyPending: boolean;
  pendingCount: number;
};

/** Live rate preview for Pending orders. Does not write. Shared by the orders list and home totals. */
export async function loadPendingOrderPricePreviews(
  orders: Array<{
    orderId: string;
    userId: number | null;
    orderStatus: string;
    buyerId?: string | null;
  }>,
): Promise<Map<string, PendingOrderPricePreview>> {
  const previewByOrderId = new Map<string, PendingOrderPricePreview>();
  const pending = orders.filter((order) => order.orderStatus === 'Pending' && order.userId != null);
  const previewConcurrency = 8;
  for (let i = 0; i < pending.length; i += previewConcurrency) {
    const chunk = pending.slice(i, i + previewConcurrency);
    await Promise.all(
      chunk.map(async (order) => {
        const userId = order.userId;
        if (userId == null) return;
        try {
          const preview = await syncOrderItemPricingFromCatalog({
            orderId: order.orderId,
            userId,
            buyerId: order.buyerId,
            persist: false,
          });
          if (preview) previewByOrderId.set(order.orderId, preview);
        } catch (err) {
          console.error('[orders] pending price preview failed', order.orderId, err);
        }
      }),
    );
  }
  return previewByOrderId;
}

/**
 * Live Pending PO prices from Offers + catalog.
 * Dashboard order detail and the orders table preview this without writing.
 * persist: true only from Send pricing, so the buyer price stays put until then.
 * - Active offer → current offer
 * - CRM buyer, no offer → product base/list price
 * - No buyerId / buyer deleted → leave lines as stored
 */
export async function syncOrderItemPricingFromCatalog(params: {
  orderId: string;
  userId: number;
  buyerId: string | null | undefined;
  persist?: boolean;
  /** Join an existing transaction so a failed send claim rolls the price writes back. */
  tx?: Prisma.TransactionClient;
}): Promise<PendingOrderPricePreview | null> {
  const buyerId = String(params.buyerId || '').trim();
  const db = params.tx ?? prisma;

  const items = await db.orderItem.findMany({
    where: { orderId: params.orderId },
  });
  if (items.length === 0) return null;

  const buyerStillLinked = buyerId
    ? await db.buyer.findFirst({
        where: { buyerId, userId: params.userId },
        select: { buyerId: true },
      })
    : null;

  const updates: PendingOrderPriceUpdate[] = [];

  for (const item of items) {
    if (!item.productId) continue;

    const productId = String(item.productId);
    const product = await db.product.findFirst({
      where: { productId, userId: params.userId },
      include: { variantOptions: true },
    });
    if (!product) continue;

    const variantOption = pickVariantOption(
      product.variantOptions,
      item.variantOptionId ?? null,
    );
    const baseUnitPrice = variantOption
      ? parsePrice(
          variantOption.sellingPrice as
            | string
            | number
            | { toNumber?: () => number; toString?: () => string }
            | null
            | undefined,
        )
      : 0;

    const offer = buyerStillLinked
      ? await getOfferForClientAndProduct(buyerId, productId, {
          userId: params.userId,
          variantOptionId: item.variantOptionId ?? null,
          db,
        })
      : null;

    // Deleted / missing CRM relationship and no offer: leave the line as stored.
    if (!offer && !buyerStillLinked) continue;

    if (!(baseUnitPrice > 0) && !offer) continue;

    const moq =
      item.moqSnapshot != null && item.moqSnapshot > 0
        ? item.moqSnapshot
        : (variantOption as { moq?: number | null } | null)?.moq ?? null;
    const snapshots = buildOfferSnapshots(baseUnitPrice, offer, moq);
    const piecesPerPackage = Math.max(1, Number(item.piecesPerPackage) || 1);
    const packageQuantity = Math.max(1, Number(item.packageQuantity) || 1);
    const pricePerPackage = snapshots.unitPrice * piecesPerPackage;
    const subtotal = pricePerPackage * packageQuantity;

    if (!(pricePerPackage > 0) && !snapshots.offerApplied) continue;

    const prevPrice = decimalToNumber(item.pricePerPackage);
    const prevSub = decimalToNumber(item.subtotal);
    const prevUnit = item.unitPriceSnapshot != null ? decimalToNumber(item.unitPriceSnapshot) : null;
    const prevPct = item.discountPercentage != null ? decimalToNumber(item.discountPercentage) : null;
    const prevAmt = item.discountAmount != null ? decimalToNumber(item.discountAmount) : null;
    const prevOriginal =
      item.originalPriceSnapshot != null ? decimalToNumber(item.originalPriceSnapshot) : null;
    const nextOriginal =
      snapshots.originalPriceSnapshot != null ? Number(snapshots.originalPriceSnapshot) : null;
    const sameMoney = (left: number | null, right: number | null) =>
      Math.abs((left ?? 0) - (right ?? 0)) < 0.0001;
    const sameText = (left: string | null | undefined, right: string | null | undefined) =>
      (left || null) === (right || null);
    const unchanged =
      sameMoney(prevPrice, pricePerPackage) &&
      sameMoney(prevSub, subtotal) &&
      sameMoney(prevUnit, snapshots.unitPrice) &&
      Boolean(item.offerApplied) === snapshots.offerApplied &&
      sameText(item.offerIdSnapshot, snapshots.offerIdSnapshot) &&
      sameText(item.offerBadgeSnapshot, snapshots.offerBadgeSnapshot) &&
      sameText(item.offerNameSnapshot, snapshots.offerNameSnapshot) &&
      sameText(item.promotionDetailsSnapshot, snapshots.promotionDetailsSnapshot) &&
      sameMoney(prevOriginal, nextOriginal) &&
      (prevPct ?? null) === (snapshots.discountPercentage ?? null) &&
      sameMoney(prevAmt, snapshots.discountAmount);

    if (unchanged) continue;

    updates.push({
      id: item.id,
      pricePerPackage,
      subtotal,
      unitPriceSnapshot: snapshots.unitPrice,
      offerApplied: snapshots.offerApplied,
      offerBadgeSnapshot: snapshots.offerBadgeSnapshot,
      offerNameSnapshot: snapshots.offerNameSnapshot,
      offerIdSnapshot: snapshots.offerIdSnapshot,
      originalPriceSnapshot: snapshots.originalPriceSnapshot,
      discountAmount: snapshots.discountAmount,
      discountPercentage: snapshots.discountPercentage,
      promotionDetailsSnapshot: snapshots.promotionDetailsSnapshot,
    });
  }

  const updateById = new Map(updates.map((update) => [update.id, update]));
  const resolvedSubtotal = items.reduce((sum, row) => {
    const next = updateById.get(row.id);
    return sum + (next ? next.subtotal : decimalToNumber(row.subtotal));
  }, 0);
  const pendingCount = items.reduce((count, row) => {
    const next = updateById.get(row.id);
    const subtotal = next ? next.subtotal : decimalToNumber(row.subtotal);
    const offerApplied = next ? next.offerApplied : Boolean(row.offerApplied);
    const pending = !(subtotal > 0) && !offerApplied;
    return pending ? count + 1 : count;
  }, 0);
  const anyPending = pendingCount > 0;
  const orderHeader = await db.order.findFirst({
    where: { orderId: params.orderId, userId: params.userId },
    select: { id: true, shippingFee: true, discounts: true },
  });
  const shippingFee = decimalToNumber(orderHeader?.shippingFee);
  const discounts = decimalToNumber(orderHeader?.discounts);
  const preview: PendingOrderPricePreview = {
    updates,
    subtotal: resolvedSubtotal,
    totalAmount:
      resolvedSubtotal <= 0 && anyPending
        ? 0
        : calculateOrderTotalAmount({
            shippingFee,
            discounts,
            orderItems: [{ subtotal: resolvedSubtotal }],
          } as Order),
    anyPending,
    pendingCount,
  };

  if (!params.persist || updates.length === 0 || !orderHeader) return preview;

  const writePrices = async (tx: Prisma.TransactionClient) => {
    for (const u of updates) {
      await tx.orderItem.update({
        where: { id: u.id },
        data: {
          pricePerPackage: u.pricePerPackage,
          subtotal: u.subtotal,
          unitPriceSnapshot: u.unitPriceSnapshot,
          offerApplied: u.offerApplied,
          offerBadgeSnapshot: u.offerBadgeSnapshot,
          offerNameSnapshot: u.offerNameSnapshot,
          offerIdSnapshot: u.offerIdSnapshot,
          originalPriceSnapshot: u.originalPriceSnapshot,
          discountAmount: u.discountAmount,
          discountPercentage: u.discountPercentage,
          promotionDetailsSnapshot: u.promotionDetailsSnapshot,
        },
      });
    }

    await tx.order.update({
      where: { id: orderHeader.id },
      data: {
        subtotal: preview.subtotal,
        totalAmount: preview.totalAmount,
      },
    });
  };

  if (params.tx) {
    await writePrices(params.tx);
  } else {
    await prisma.$transaction(writePrices);
  }

  return preview;
}
