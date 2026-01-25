import { prisma } from '@/lib/db';
import { calculatePromotionGift, PromotionDetails } from './promotionUtils';
import { parseMoney } from '@/app/api/graphql/modules/common/utils';

// Central helper to build mobile marketplace Buyer IDs consistently across modules
// Base: LKB-<marketplaceUserId padded>
// Per distributor: LKB-<marketplaceUserId padded>-<distributorUserId>
export function buildMobileBuyerId(marketplaceUserId: number, distributorUserId?: number): string {
  const baseId = `LKB-${marketplaceUserId.toString().padStart(8, '0')}`;
  return typeof distributorUserId === 'number' ? `${baseId}-${distributorUserId}` : baseId;
}

/**
 * Parse marketplace user ID from a buyerId. Supports:
 * - mobile_user_X (legacy)
 * - LKB-<padded 8 digits> or LKB-<padded 8 digits>-<distributorId> (mobile app)
 * Returns null if not a mobile buyer format.
 */
export function parseMarketplaceUserIdFromBuyerId(buyerId: string | null | undefined): number | null {
  if (!buyerId || typeof buyerId !== 'string') return null;
  if (buyerId.startsWith('mobile_user_')) {
    const n = parseInt(buyerId.replace('mobile_user_', ''), 10);
    return isNaN(n) ? null : n;
  }
  if (buyerId.startsWith('LKB-')) {
    const after = buyerId.slice(4);
    const firstPart = after.includes('-') ? after.split('-')[0] : after;
    const n = parseInt(firstPart, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

export async function syncOrderToBuyerProfile(buyerId: string, userId: number) {
  try {
    // Get buyer
    const buyer = await prisma.buyer.findUnique({
      where: { buyerId }
    });

    if (!buyer) {
      return;
    }

    // Get all orders for this buyer that belong ONLY to the provided distributor (userId)
    // Exclude cancelled and returned
    const orders = await prisma.order.findMany({
      where: {
        buyerId: buyerId,
        userId: userId,
        orderStatus: { notIn: ['Cancelled', 'Returned'] } // Exclude cancelled and returned orders
      },
      include: {
        orderItemsRel: true
      }
    });

    // Calculate totals
    let totalSpend = 0;
    let totalOutstanding = 0;
    let orderCount = 0;
    const monthlyData: { [key: string]: { spend: number; orders: number } } = {};

    for (const order of orders) {
      // Convert Decimal values to numbers for calculations
      const orderSpend = order.orderItemsRel.reduce((sum: number, item: { subtotal: unknown }) => {
        return sum + parseMoney(item.subtotal as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined);
      }, 0);
      const shippingFee = parseMoney((order as { shippingFee?: unknown }).shippingFee as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined);
      const totalOrderAmount = orderSpend + shippingFee;
      
      totalSpend += totalOrderAmount;
      orderCount++;

      // Outstanding calculation (only for pending/unpaid orders)
      if (order.paymentStatus === 'Pending' || order.paymentStatus === 'Unpaid') {
        totalOutstanding += totalOrderAmount;
      }

      // Monthly data
      const monthKey = order.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { spend: 0, orders: 0 };
      }
      monthlyData[monthKey].spend += totalOrderAmount;
      monthlyData[monthKey].orders += 1;
    }

    // Calculate monthly averages
    const monthlyAverages = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      totalSpend: data.spend,
      orderCount: data.orders
    }));

    // Process orders into orderDetails format for the buyer profile
    const orderDetails = orders.map(order => {
      const productNames = order.orderItemsRel.map(item => 
        item.productNameSnapshot || 'Unknown Product'
      ).join(', ');
      
      // Calculate total orders (packages) including free pieces from promotions
      const totalOrders = order.orderItemsRel.reduce((sum: number, item: { 
        packageQuantity: number | null;
        piecesPerPackage: number | null;
        promotionDetailsSnapshot: string | null;
        moqSnapshot: number | null;
      }) => {
        const paidPackages = item.packageQuantity ?? 1;
        const piecesPerPackage = item.piecesPerPackage ?? 1;
        const paidPieces = paidPackages * piecesPerPackage;
        
        // Calculate free pieces from buy-x-get-y promotions
        let freePieces = 0;
        if (item.promotionDetailsSnapshot) {
          try {
            const promotionDetails: PromotionDetails = JSON.parse(item.promotionDetailsSnapshot);
            const moq = item.moqSnapshot ?? null;
            const promotionGift = calculatePromotionGift(promotionDetails, paidPieces, moq);
            freePieces = promotionGift?.freeQty || 0;
          } catch {
            // Invalid JSON, skip free items
          }
        }
        
        // Convert free pieces to packages and add to paid packages
        const freePackages = piecesPerPackage > 0 ? freePieces / piecesPerPackage : 0;
        return sum + paidPackages + freePackages;
      }, 0);
      // Convert Decimal values to numbers for calculations
      const orderSpend = order.orderItemsRel.reduce((sum: number, item: { subtotal: unknown }) => {
        return sum + parseMoney(item.subtotal as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined);
      }, 0);
      const shippingFee = parseMoney((order as { shippingFee?: unknown }).shippingFee as string | number | { toNumber?: () => number; toString?: () => string } | null | undefined);
      const orderTotal = orderSpend + shippingFee;
      const orderOutstanding = (order.paymentStatus === 'Pending' || order.paymentStatus === 'Unpaid') ? orderTotal : 0;
      
      return {
        orderNo: order.orderId,
        product: productNames,
        totalOrders: totalOrders.toString(),
        totalSpend: orderTotal.toString(), // Store product cost + shipping fee combined
        shippingFee: shippingFee.toString(),
        lastOrderDate: order.createdAt.toISOString().split('T')[0],
        outstanding: orderOutstanding.toString()
      };
    });

    // Update buyer with synced order details - scope to this distributor
    await prisma.buyer.update({
      where: { buyerId },
      data: {
        orderDetails: JSON.stringify(orderDetails),
        updatedAt: new Date()
      }
    });

  } catch (error) {
  }
}
