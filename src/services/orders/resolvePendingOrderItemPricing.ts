import { prisma } from '@/lib/db';
import {
  applyOfferToPrice,
  getOfferForClientAndProduct,
  type ResolvedOffer,
} from '@/lib/offers/getOfferForClientAndProduct';
import { parsePrice } from '@/utils/currencyUtils';
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
    offer.discountType === 'fixed_amount' ||
    offer.discountType === 'fixed_price'
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
          applyMode: 'after_moq',
        })
      : null,
  };
}

/**
 * Distributor Order Detail: keep line prices in sync with Products + live Offers.
 * - No client offer → product base/list (selling) price
 * - Active offer → re-apply current offer (so offer edits reflect on Pending POs)
 */
export async function syncOrderItemPricingFromCatalog(params: {
  orderId: string;
  userId: number;
  buyerId: string | null | undefined;
}): Promise<void> {
  const buyerId = String(params.buyerId || '').trim();

  const items = await prisma.orderItem.findMany({
    where: { orderId: params.orderId },
  });
  if (items.length === 0) return;

  type ItemUpdate = {
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
  const updates: ItemUpdate[] = [];

  for (const item of items) {
    if (!item.productId) continue;

    const productId = String(item.productId);
    const product = await prisma.product.findFirst({
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

    if (!(baseUnitPrice > 0) && !buyerId) continue;

    const offer = buyerId
      ? await getOfferForClientAndProduct(buyerId, productId, {
          userId: params.userId,
          variantOptionId: item.variantOptionId ?? null,
        })
      : null;

    const snapshots = buildOfferSnapshots(baseUnitPrice, offer);
    const piecesPerPackage = Math.max(1, Number(item.piecesPerPackage) || 1);
    const packageQuantity = Math.max(1, Number(item.packageQuantity) || 1);
    const pricePerPackage = snapshots.unitPrice * piecesPerPackage;
    const subtotal = pricePerPackage * packageQuantity;

    if (!(pricePerPackage > 0) && !snapshots.offerApplied) continue;

    const prevPrice = decimalToNumber(item.pricePerPackage);
    const prevSub = decimalToNumber(item.subtotal);
    const prevPct = item.discountPercentage != null ? decimalToNumber(item.discountPercentage) : null;
    const prevAmt = item.discountAmount != null ? decimalToNumber(item.discountAmount) : null;
    const unchanged =
      Math.abs(prevPrice - pricePerPackage) < 0.0001 &&
      Math.abs(prevSub - subtotal) < 0.0001 &&
      Boolean(item.offerApplied) === snapshots.offerApplied &&
      (item.offerIdSnapshot || null) === (snapshots.offerIdSnapshot || null) &&
      (prevPct ?? null) === (snapshots.discountPercentage ?? null) &&
      Math.abs((prevAmt ?? 0) - (snapshots.discountAmount ?? 0)) < 0.0001;

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

  if (updates.length === 0) return;

  await prisma.$transaction(async (tx) => {
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

    const remaining = await tx.orderItem.findMany({
      where: { orderId: params.orderId },
      select: { subtotal: true, pricePerPackage: true, offerApplied: true },
    });
    const order = await tx.order.findFirst({
      where: { orderId: params.orderId, userId: params.userId },
      select: { id: true, shippingFee: true, discounts: true },
    });
    if (!order) return;

    const resolvedSubtotal = remaining.reduce((sum, row) => sum + decimalToNumber(row.subtotal), 0);
    const anyPending = remaining.some(
      (row) =>
        !(decimalToNumber(row.subtotal) > 0) &&
        !(decimalToNumber(row.pricePerPackage) > 0) &&
        !row.offerApplied,
    );
    const shippingFee = decimalToNumber(order.shippingFee);
    const discounts = decimalToNumber(order.discounts);

    await tx.order.update({
      where: { id: order.id },
      data: {
        subtotal: resolvedSubtotal,
        // Match set-item-price: keep a running total when some lines are priced;
        // only force 0 when nothing resolved yet and lines are still pending.
        totalAmount:
          resolvedSubtotal <= 0 && anyPending
            ? 0
            : Math.max(0, resolvedSubtotal + shippingFee - discounts),
      },
    });
  });
}
