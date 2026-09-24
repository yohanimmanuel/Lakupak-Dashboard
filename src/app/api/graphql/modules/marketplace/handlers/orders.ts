import { prisma } from '../../common/prisma';
import { sanitizePagination, buildPaginationInfo, parseMoney } from '../../common/utils';
import { buildMobileBuyerId } from '@/utils/buyerSync';
import { applyBuyerPriceVisibility } from '@/services/mobileOrders/maskBuyerFacingPrices';

export const fetchMobileOrders = async (args: {
  userId: number;
  page?: number;
  limit?: number;
}) => {
  // This will be implemented by calling the orders module
  // For now, return empty result - will be implemented in next step
  const { page = 1, limit = 10 } = args;
  
  const marketplaceUser = await prisma.marketplaceUser.findUnique({
    where: { id: args.userId }
  });
  
  if (!marketplaceUser) {
    throw new Error('User not found');
  }
  
  const baseBuyerId = buildMobileBuyerId(marketplaceUser.id);
  const { page: safePage, limit: safeLimit } = sanitizePagination(page, limit);
  const skip = (safePage - 1) * safeLimit;
  const take = safeLimit;
  
  const orders = await prisma.order.findMany({
    where: {
      buyerId: {
        startsWith: baseBuyerId
      }
    },
    skip,
    take,
    orderBy: { orderDate: 'desc' },
    include: {
      user: {
        include: {
          company: true
        }
      },
      orderItemsRel: {
        include: {
          product: {
            include: {
              user: {
                include: {
                  company: true
                }
              }
            }
          }
        }
      },
      returnRequests: true
    }
  });
  
  const total = await prisma.order.count({
    where: {
      buyerId: {
        startsWith: baseBuyerId
      }
    }
  });
  
  const ordersWithItems = orders.map(order => {
    const orderItems = (order.orderItemsRel || []).map((oi) => ({
      productId: oi.productId ?? null,
      subtotal: oi.subtotal,
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage,
      productName: oi.product?.name || oi.productNameSnapshot || 'Unknown Product',
      category: oi.product?.productType || oi.productTypeSnapshot || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: oi.productNameSnapshot || null,
      productSkuSnapshot: oi.productSkuSnapshot || null,
      productTypeSnapshot: oi.productTypeSnapshot || null,
      variantNameSnapshot: oi.variantNameSnapshot || null,
      offerApplied: oi.offerApplied || false,
      offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
      offerNameSnapshot: oi.offerNameSnapshot || null,
      originalPriceSnapshot: oi.originalPriceSnapshot ? parseMoney(oi.originalPriceSnapshot) : null, // Convert Decimal to number
      discountPercentage: oi.discountPercentage ? parseMoney(oi.discountPercentage) : null, // Convert Decimal to number
      discountAmount: oi.discountAmount ? parseMoney(oi.discountAmount) : null, // Convert Decimal to number
      promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null,
      moqSnapshot: oi.moqSnapshot || null,
      product: oi.product ? {
        userId: oi.product.userId ?? null,
        name: oi.product.name ?? null,
      } : null
    }));
    
    const distributorUser = order.user;

    return {
      ...order,
      orderDate: order.orderDate?.toISOString() ?? '',
      createdAt: order.createdAt?.toISOString() ?? null,
      updatedAt: order.updatedAt?.toISOString() ?? null,
      preferredDeliveryDate: order.preferredDeliveryDate?.toISOString() ?? null,
      preferredPickupDate: order.preferredPickupDate?.toISOString() ?? null,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      returnedAt: order.returnedAt?.toISOString() ?? null,
      returnCollectedAt: order.returnCollectedAt?.toISOString() ?? null,
      returnItemsReceivedAt: order.returnItemsReceivedAt?.toISOString() ?? null,
      returnPod: order.returnPod ?? null,
      seller: distributorUser
        ? {
            name:
              [distributorUser.firstName, distributorUser.lastName]
                .filter(Boolean)
                .join(' ')
                .trim() || null,
            companyName: distributorUser.company?.name ?? null,
            companyAddress: distributorUser.company?.businessAddress ?? null,
            companyPhone: distributorUser.company?.businessPhone ?? null,
            companyEmail: distributorUser.company?.businessEmail ?? null,
            shippingPreferences: distributorUser.company?.shippingPreferences ?? null,
            logo: distributorUser.company?.logo ?? null,
            bannerImage: distributorUser.company?.bannerImage ?? null,
          }
        : null,
      orderItems: orderItems,
      returnRequests: (order.returnRequests ?? []).map((rr: { id: number; orderId: string; marketplaceUserId: number; reason: string; reasonDetail: string | null; imageUrls: string[]; status: string; createdAt: Date; updatedAt: Date }) => ({
        id: rr.id,
        orderId: rr.orderId,
        marketplaceUserId: rr.marketplaceUserId,
        reason: rr.reason,
        reasonDetail: rr.reasonDetail,
        imageUrls: rr.imageUrls ?? [],
        status: rr.status,
        createdAt: rr.createdAt?.toISOString() ?? null,
        updatedAt: rr.updatedAt?.toISOString() ?? null,
      })),
    };
  });
  
  const pagination = buildPaginationInfo(safePage, safeLimit, total);
  const buyerVisibleOrders = await applyBuyerPriceVisibility(ordersWithItems);

  return {
    nodes: buyerVisibleOrders,
    pagination
  };
};

