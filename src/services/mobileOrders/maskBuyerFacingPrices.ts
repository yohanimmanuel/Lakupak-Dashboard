type BuyerPriceLine = {
  offerApplied?: boolean | null;
  subtotal?: unknown;
  pricePerPackage?: unknown;
  piecesPerPackage?: number | null;
  packageQuantity?: number | null;
  offerBadgeSnapshot?: string | null;
  offerNameSnapshot?: string | null;
  offerIdSnapshot?: string | null;
  originalPriceSnapshot?: unknown;
  discountPercentage?: unknown;
  discountAmount?: unknown;
  promotionDetailsSnapshot?: string | null;
};

type BuyerPriceOrder = {
  orderId: string;
  buyerId?: string | null;
  userId?: number | null;
  pricingSentAt?: Date | string | null;
  subtotal?: unknown;
  discounts?: unknown;
  shippingFee?: unknown;
  totalAmount?: unknown;
  user?: {
    company?: { autoApplyBasePriceForFirstBuyers?: boolean | null } | null;
  } | null;
  orderItems: BuyerPriceLine[];
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber() || 0;
  }
  return Number(value) || 0;
}

/**
 * Catalog price per package as stored at PO submit: client-rate lines keep the
 * catalog unit price in `originalPriceSnapshot`, other lines store it directly.
 */
function basePricePerPackage(item: BuyerPriceLine): number {
  const pieces = Math.max(1, Number(item.piecesPerPackage) || 1);
  const originalUnit = toNumber(item.originalPriceSnapshot);
  if (item.offerApplied && originalUnit > 0) return originalUnit * pieces;
  return Math.max(0, toNumber(item.pricePerPackage));
}

/**
 * Distributor rows always keep catalog/offer amounts.
 * Buyers receive the PO (discounted) money when:
 * - the distributor has sent pricing, or
 * - the distributor shows discounted prices on submit
 *   (`autoApplyBasePriceForFirstBuyers`, kept as the column name).
 * Otherwise buyers see the catalog base price, without the discount amount.
 * Buy X Get Y stays on the line so the order list can show it beside the quantity.
 * Offer activate/deactivate stays on the distributor order until Send pricing.
 * A line without a base price zeros the order total so cards show "Pending price".
 */
export async function applyBuyerPriceVisibility<T extends BuyerPriceOrder>(
  orders: T[],
): Promise<T[]> {
  return orders.map((order) => {
    const released = order.pricingSentAt != null;
    const showOnPo = Boolean(order.user?.company?.autoApplyBasePriceForFirstBuyers);
    if (released || showOnPo) return order;

    let subtotal = 0;
    let anyPending = false;
    const orderItems = order.orderItems.map((item) => {
      const pricePerPackage = basePricePerPackage(item);
      const quantity = Math.max(0, Number(item.packageQuantity) || 0);
      const lineSubtotal = pricePerPackage * quantity;
      if (!(lineSubtotal > 0)) anyPending = true;
      subtotal += lineSubtotal;
      return {
        ...item,
        subtotal: lineSubtotal,
        pricePerPackage,
        // Keep the Buy X Get Y snapshot so the order list can show it beside qty.
        // Price fields above stay the catalog base until Send pricing or the PO toggle.
        offerApplied: false,
        offerBadgeSnapshot: null,
        offerNameSnapshot: null,
        offerIdSnapshot: null,
        originalPriceSnapshot: null,
        discountPercentage: null,
        discountAmount: null,
        promotionDetailsSnapshot: item.promotionDetailsSnapshot ?? null,
      };
    });

    const totalAmount = anyPending ? 0 : subtotal + Math.max(0, toNumber(order.shippingFee));

    return {
      ...order,
      orderItems,
      subtotal: anyPending ? 0 : subtotal,
      discounts: 0,
      totalAmount,
    };
  });
}
