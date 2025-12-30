import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@/lib/db';
import { prisma } from '@/lib/db';
import { OrderItem } from '@/types/order';
import { 
  getOrderSecurityHeaders, 
  validateOrderInput, 
  validateOrderUpdate,
  sanitizeOrderData,
  generateSecureOrderId,
  validateOrderAccess
} from '@/utils/order-security';
import { syncOrderToBuyerProfile } from '@/utils/buyerSync';
import { recalculateEntireOrder, validateAndCorrectOrder } from '@/utils/orderCalculations';
import { ensureAllPriceConsistency } from '@/utils/orderUtils';
import { validateOfferForProduct, trackOfferUsage as trackOfferUsageUtil, trackOfferUsageForAllTypes, createOfferSnapshot, reverseOfferUsage, updateOfferStatusesBasedOnLimits } from '@/utils/offerValidation';
import { validateVariant, parseVariantPrice } from '@/services/variantService';
import { parsePrice } from '@/utils/currencyUtils';
import { broadcastOrderUpdate, broadcastProductUpdate } from '@/utils/websocketBroadcast';
import { 
  orderQueryRateLimiter,
  orderCreationRateLimiter,
  orderUpdateRateLimiter
} from '@/utils/rateLimiter';

interface OfferDiscountType {
  id: string;
  discountType: string;
  discountValue: number;
  minQuantity: number | null;
  freeQuantity: number | null;
  isActive: boolean;
  description: string | null;
}


async function broadcastSoldCountUpdates(orderId: string): Promise<void> {
  try {
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true },
    });
    const productIds = Array.from(
      new Set(
        orderItems
          .map((item: { productId: string | null }) => item.productId)
          .filter((id: string | null): id is string => Boolean(id)),
      ),
    ) as string[];
    if (productIds.length > 0) {
      await broadcastProductUpdate(productIds);
    }
  } catch (error) {
    // Ignore broadcast errors to keep order flow unaffected
  }
}

// GET /api/orders - Get all orders or get by ID
export async function GET(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const archivedFlag = searchParams.get('archived');
    const userId = searchParams.get('userId');
    const checkExists = searchParams.get('checkExists');
    const orderIds = searchParams.get('orderIds');
    
    // Apply rate limiting for order queries: 50 per minute per user
    if (userId && !isNaN(Number(userId))) {
      const rateLimitResponse = await orderQueryRateLimiter(request, Number(userId));
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    // Handle checking order existence
    if (checkExists === 'true' && orderIds) {
      try {
        const orderIdArray = JSON.parse(orderIds);
        const existingOrders = await prisma.order.findMany({
          where: {
            orderId: {
              in: orderIdArray
            },
            isDeleted: false
          },
          select: {
            orderId: true
          }
        });
        
        const existingOrderIds = existingOrders.map((order: { orderId: string }) => order.orderId);
        return NextResponse.json({ existingOrderIds }, { headers });
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid orderIds format' },
          { status: 400, headers }
        );
      }
    }
    
    // Make user scoping optional for backward compatibility
    const userWhere: Record<string, unknown> = (userId && !isNaN(Number(userId))) ? { userId: Number(userId) } : {};
    
    if (id) {
      // Get single order by ID
      const includeDeleted = searchParams.get('includeDeleted') === 'true';
      const order = await prisma.order.findFirst({
        where: { 
          orderId: id,
          ...userWhere,
          ...(includeDeleted ? {} : { isDeleted: false })
        },
        include: {
          buyer: true,
          user: {
            include: {
              company: true
            }
          },
          orderItemsRel: {
            include: {
              product: true
            }
          }
        }
      });

      if (!order) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404, headers }
        );
      }

      // Build items directly from relational rows with snapshot fallbacks
      const enrichedOrderItems = (order.orderItemsRel || []).map((oi: {
        productId: string | null;
        subtotal: number;
        packageType?: string | null;
        piecesPerPackage?: number | null;
        packageQuantity?: number | null;
        pricePerPackage?: number | null;
        product?: { name: string; productType: string; brand: string; description: string; images: string[] } | null;
        productNameSnapshot?: string | null;
        productSkuSnapshot?: string | null;
        productTypeSnapshot?: string | null;
        variantNameSnapshot?: string | null;
        variantId?: number | null;
      }) => ({
        productId: oi.productId ?? null,
        subtotal: oi.subtotal,
        packageType: oi.packageType,
        piecesPerPackage: oi.piecesPerPackage,
        packageQuantity: oi.packageQuantity,
        pricePerPackage: oi.pricePerPackage,
        productName: oi.product?.name || (oi as { productNameSnapshot?: string }).productNameSnapshot || 'Unknown Product',
        category: oi.product?.productType || (oi as { productTypeSnapshot?: string }).productTypeSnapshot || 'Uncategorized',
        brand: oi.product?.brand || 'Unknown Brand',
        description: oi.product?.description || '',
        images: oi.product?.images || [],
        productDeleted: !oi.product,
        productNameSnapshot: (oi as { productNameSnapshot?: string }).productNameSnapshot || null,
        productSkuSnapshot: (oi as { productSkuSnapshot?: string }).productSkuSnapshot || null,
        productTypeSnapshot: (oi as { productTypeSnapshot?: string }).productTypeSnapshot || null,
        // Variant snapshot (at purchase time)
        variantNameSnapshot: (oi as { variantNameSnapshot?: string | null }).variantNameSnapshot || null,
        variantId: (oi as { variantId?: number | null }).variantId || null,
        variantOptionId: (oi as { variantOptionId?: number | null }).variantOptionId || null,
        // Offer snapshots from time of purchase
        offerApplied: (oi as { offerApplied?: boolean }).offerApplied || false,
        offerBadgeSnapshot: (oi as { offerBadgeSnapshot?: string | null }).offerBadgeSnapshot || null,
        offerNameSnapshot: (oi as { offerNameSnapshot?: string | null }).offerNameSnapshot || null,
        originalPriceSnapshot: (oi as { originalPriceSnapshot?: string | null }).originalPriceSnapshot || null,
        discountPercentage: (oi as { discountPercentage?: number | null }).discountPercentage || null,
        discountAmount: (oi as { discountAmount?: number | null }).discountAmount || null,
        promotionDetailsSnapshot: (oi as { promotionDetailsSnapshot?: string | null }).promotionDetailsSnapshot || null
      }));

      return NextResponse.json({ ...order, orderItems: enrichedOrderItems }, { headers });
    }
    
    // Get all orders with pagination and filters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const buyerId = searchParams.get('buyerId');
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' }, 
        { status: 400, headers }
      );
    }
    
    const skip = (page - 1) * limit;
    
    // Build where clause with optional multi-tenant security
    const where: Record<string, unknown> = { ...userWhere };
    if (archivedFlag === '1' || archivedFlag === 'true') {
      where.archivedAt = { not: null };
    } else {
      where.archivedAt = null;
    }
    
    // Exclude soft-deleted orders by default
    const includeDeleted = searchParams.get('includeDeleted') === 'true';
    if (!includeDeleted) {
      where.isDeleted = false;
    }
    
    if (status && status !== 'All') where.orderStatus = status;
    if (buyerId) where.buyerId = buyerId;
    
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          buyer: true,
          user: true,
          orderItemsRel: {
            include: {
              product: true
            }
          }
        }
      }),
      prisma.order.count({ where })
    ]);
    
    // Build items from relational rows for each order (with snapshots)
    const ordersWithParsedItems = orders.map((order: {
      orderItemsRel?: Array<{
        productId: string | null;
        subtotal: number;
        packageType?: string | null;
        piecesPerPackage?: number | null;
        packageQuantity?: number | null;
        pricePerPackage?: number | null;
        product?: { name: string; productType: string; brand: string; description: string; images: string[] } | null;
        productNameSnapshot?: string | null;
        productSkuSnapshot?: string | null;
        productTypeSnapshot?: string | null;
        variantNameSnapshot?: string | null;
        variantId?: number | null;
      }>;
      [key: string]: unknown;
    }) => {
      const enrichedOrderItems = (order.orderItemsRel || []).map((oi: {
        productId: string | null;
        subtotal: number;
        packageType?: string | null;
        piecesPerPackage?: number | null;
        packageQuantity?: number | null;
        pricePerPackage?: number | null;
        product?: { name: string; productType: string; brand: string; description: string; images: string[] } | null;
        productNameSnapshot?: string | null;
        productSkuSnapshot?: string | null;
        productTypeSnapshot?: string | null;
        variantNameSnapshot?: string | null;
        variantId?: number | null;
      }) => ({
        productId: oi.productId ?? null,
        subtotal: oi.subtotal,
        packageType: oi.packageType,
        piecesPerPackage: oi.piecesPerPackage,
        packageQuantity: oi.packageQuantity,
        pricePerPackage: oi.pricePerPackage,
        productName: oi.product?.name || (oi as { productNameSnapshot?: string }).productNameSnapshot || 'Unknown Product',
        category: oi.product?.productType || (oi as { productTypeSnapshot?: string }).productTypeSnapshot || 'Uncategorized',
        brand: oi.product?.brand || 'Unknown Brand',
        description: oi.product?.description || '',
        images: oi.product?.images || [],
        productDeleted: !oi.product,
        productNameSnapshot: (oi as { productNameSnapshot?: string }).productNameSnapshot || null,
        productSkuSnapshot: (oi as { productSkuSnapshot?: string }).productSkuSnapshot || null,
        productTypeSnapshot: (oi as { productTypeSnapshot?: string }).productTypeSnapshot || null,
        // Variant snapshot (at purchase time)
        variantNameSnapshot: (oi as { variantNameSnapshot?: string | null }).variantNameSnapshot || null,
        variantId: (oi as { variantId?: number | null }).variantId || null,
        variantOptionId: (oi as { variantOptionId?: number | null }).variantOptionId || null,
        // Offer snapshots from time of purchase
        offerApplied: (oi as { offerApplied?: boolean }).offerApplied || false,
        offerBadgeSnapshot: (oi as { offerBadgeSnapshot?: string | null }).offerBadgeSnapshot || null,
        offerNameSnapshot: (oi as { offerNameSnapshot?: string | null }).offerNameSnapshot || null,
        originalPriceSnapshot: (oi as { originalPriceSnapshot?: string | null }).originalPriceSnapshot || null,
        discountPercentage: (oi as { discountPercentage?: number | null }).discountPercentage || null,
        discountAmount: (oi as { discountAmount?: number | null }).discountAmount || null,
        promotionDetailsSnapshot: (oi as { promotionDetailsSnapshot?: string | null }).promotionDetailsSnapshot || null
      }));
      return { ...order, orderItems: enrichedOrderItems };
    });
    
    return NextResponse.json({
      orders: ordersWithParsedItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500, headers }
    );
  }
}

// POST /api/orders - Create new order
export async function POST(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();
    
    // Apply rate limiting for order creation: 50 per hour per user
    if (body.userId && !isNaN(Number(body.userId))) {
      const rateLimitResponse = await orderCreationRateLimiter(request, Number(body.userId));
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    // Validate input data
    const validation = validateOrderInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers }
      );
    }
    
    // Sanitize input data
    const sanitizedData = sanitizeOrderData(body);
    
    // Generate order ID if not provided
    if (!sanitizedData.orderId) {
      sanitizedData.orderId = generateSecureOrderId();
    }
    
    // Ensure price consistency and compute totals
    let orderItems: Array<{
      productId: string;
      quantity: number;
      subtotal: number;
      packageType?: string;
      piecesPerPackage?: number;
      packageQuantity?: number;
      pricePerPackage?: number;
    }> = [];
    
    if (sanitizedData.orderItems) {
      // If it's a string, parse it as JSON
      if (typeof sanitizedData.orderItems === 'string') {
        try {
          orderItems = JSON.parse(sanitizedData.orderItems);
        } catch (error) {
          orderItems = [];
        }
      } else if (Array.isArray(sanitizedData.orderItems)) {
        orderItems = sanitizedData.orderItems;
      }
    }
    
    const consistentOrderItems = await ensureAllPriceConsistency(orderItems as unknown as OrderItem[]);
    const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
    const totalQtyCalc = consistentOrderItems.reduce((sum, it) => {
      const piecesPerPackage = it.piecesPerPackage || 1;
      const packageQuantity = it.packageQuantity || 1;
      return sum + (packageQuantity * piecesPerPackage);
    }, 0);
    
    // Parse currency values (now expecting raw numbers from marketplace)
    const parseCurrencyValue = (value: unknown): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        // Parse as number directly since marketplace now sends raw numbers
        return parseFloat(value) || 0;
      }
      return 0;
    };
    
    const shippingFee = parseCurrencyValue(sanitizedData.shippingFee);
    const discounts = parseCurrencyValue(sanitizedData.discounts);
    const totalAmountCalc = subtotalCalc + shippingFee - discounts;
    

    // Determine the correct userId based on product ownership - NO FALLBACKS
    let distributorUserId = null;
    
    // Get the first product to determine the distributor
    if (Array.isArray(consistentOrderItems) && consistentOrderItems.length > 0) {
      try {
        // Try multiple lookup strategies
        let firstProduct = await prisma.product.findFirst({
          where: { productId: String(consistentOrderItems[0].productId) }
        });
        
        // If not found by productId, try by id (in case it's a numeric ID)
        if (!firstProduct && !isNaN(Number(consistentOrderItems[0].productId))) {
          firstProduct = await prisma.product.findFirst({
            where: { id: Number(consistentOrderItems[0].productId) }
          });
        }
        
        // If still not found, try by name (in case productId is actually a name)
        if (!firstProduct) {
          firstProduct = await prisma.product.findFirst({
            where: { name: { contains: String(consistentOrderItems[0].productId) } }
          });
        }
        
        if (firstProduct && firstProduct.userId) {
          distributorUserId = firstProduct.userId;
        } else {
          throw new Error(`Product not found: ${consistentOrderItems[0].productId}. Cannot determine distributor userId.`);
        }
      } catch (productError) {
        throw new Error(`Failed to determine distributor userId: ${productError instanceof Error ? productError.message : String(productError)}`);
      }
    } else {
      throw new Error('No order items provided - cannot determine distributor userId');
    }
    
    if (!distributorUserId) {
      throw new Error('Failed to determine distributor userId - this should not happen');
    }
    
    // Handle buyer creation/upsert - ensure buyer exists
    if (sanitizedData.buyerId) {
      try {
        // Use upsert to create buyer if not exists, or update if exists
        await prisma.buyer.upsert({
          where: { buyerId: String(sanitizedData.buyerId) },
          update: {
            // Update buyer info if it exists (in case contact details changed)
            owner: String(sanitizedData.contactPerson || 'Unknown'),
            email: String(sanitizedData.customerEmail || 'unknown@laku.com'),
            phone: String(sanitizedData.contactPhone || '0000000000'),
            storeName: String(sanitizedData.storeName || 'Unknown Store'),
            address: String(sanitizedData.deliveryAddress || 'Unknown Address'),
            userId: distributorUserId  // Use the distributor's userId
          },
          create: {
            buyerId: String(sanitizedData.buyerId || ''),
            owner: String(sanitizedData.contactPerson || 'Unknown'),
            email: String(sanitizedData.customerEmail || 'unknown@laku.com'),
            phone: String(sanitizedData.contactPhone || '0000000000'),
            storeName: String(sanitizedData.storeName || 'Unknown Store'),
            businessType: 'Retail',
            address: String(sanitizedData.deliveryAddress || 'Unknown Address'),
            status: 'Active',
            userId: distributorUserId  // Use the distributor's userId
          }
        });
      } catch (buyerError) {
        // Continue with order creation even if buyer creation fails
      }
    }
    
    // Convert orderItems to JSON string
    const orderData = {
      orderId: String(sanitizedData.orderId),
      buyerId: String(sanitizedData.buyerId || ''),  // This is the foreign key field
      buyerIdSnapshot: String(sanitizedData.buyerId || ''),
      orderDate: new Date(String(sanitizedData.orderDate || new Date())),
      orderDateSnapshot: new Date(String(sanitizedData.orderDate || new Date())),
      orderStatus: String(sanitizedData.orderStatus || 'Pending'),
      paymentStatus: String(sanitizedData.paymentStatus || 'Unpaid'),
      deliveryMethod: String(sanitizedData.deliveryMethod || 'Distributor Fleet'),
      deliveryOption: sanitizedData.deliveryOption ? String(sanitizedData.deliveryOption) : null,
      subtotal: subtotalCalc,
      discounts: discounts,
      shippingFee: shippingFee,
      totalAmount: totalAmountCalc,
      paymentTerms: String(sanitizedData.paymentTerms || ''),
      totalOrders: totalQtyCalc,
      contactPerson: String(sanitizedData.contactPerson || ''),
      contactPersonSnapshot: String(sanitizedData.contactPerson || ''),
      storeName: String(sanitizedData.storeName || ''),
      storeNameSnapshot: String(sanitizedData.storeName || ''),
      contactPhone: String(sanitizedData.contactPhone || ''),
      contactPhoneSnapshot: String(sanitizedData.contactPhone || ''),
      customerEmail: sanitizedData.customerEmail ? String(sanitizedData.customerEmail) : null,
      customerEmailSnapshot: sanitizedData.customerEmail ? String(sanitizedData.customerEmail) : null,
      deliveryAddress: String(sanitizedData.deliveryAddress || ''),
      deliveryAddressSnapshot: String(sanitizedData.deliveryAddress || ''),
      preferredDeliveryDate: sanitizedData.preferredDeliveryDate ? new Date(String(sanitizedData.preferredDeliveryDate)) : null,
      preferredDeliveryTime: sanitizedData.preferredDeliveryTime ? String(sanitizedData.preferredDeliveryTime) : null,
      preferredPickupDate: sanitizedData.preferredPickupDate ? new Date(String(sanitizedData.preferredPickupDate)) : null,
      preferredPickupTime: sanitizedData.preferredPickupTime ? String(sanitizedData.preferredPickupTime) : null,
      assignedLogistics: sanitizedData.assignedLogistics ? String(sanitizedData.assignedLogistics) : null,
      trackingNumber: sanitizedData.trackingNumber ? String(sanitizedData.trackingNumber) : null,
      deliveryNote: sanitizedData.deliveryNote ? String(sanitizedData.deliveryNote) : null,
      deliveryConfirmation: sanitizedData.deliveryConfirmation ? String(sanitizedData.deliveryConfirmation) : 'pending',
      pod: sanitizedData.pod ? String(sanitizedData.pod) : null,
      // Remove orderItems field - it's not a valid Prisma field, handled separately via orderItemsRel
      acceptedBy: sanitizedData.acceptedBy
        ? String(sanitizedData.acceptedBy)
        : (String(sanitizedData.orderStatus || 'Pending') === 'Confirmed' ? 'Admin' : null),
      // Auto-set acceptedAt if status is Confirmed and not explicitly provided
      acceptedAt: sanitizedData.acceptedAt
        ? new Date(String(sanitizedData.acceptedAt))
        : (String(sanitizedData.orderStatus || 'Pending') === 'Confirmed' ? new Date() : null),
      userId: distributorUserId || (typeof sanitizedData.userId === 'number' ? sanitizedData.userId : null)
    };
    
    const order = await prisma.order.create({
      data: orderData,
      include: {
        buyer: true,
        user: true,
        orderItemsRel: {
          include: {
            product: true
          }
        }
      }
    });
    
    // Create OrderItem records for each item with price consistency and offer validation
    
    if (Array.isArray(consistentOrderItems) && consistentOrderItems.length > 0) {
      try {
        // Track used offer IDs for targeted deactivation
        const usedOfferIds: string[] = [];
        
        // Use a single transaction for all offer validation, tracking, and price updates
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          
          // Process all order items
          const orderItemPromises = consistentOrderItems.map(async (item: OrderItem) => {
            // Get the variant first to calculate total pieces for MOQ validation
            const product = await tx.product.findFirst({
              where: { productId: String(item.productId) },
              include: { variantOptions: true, variants: true }
            });
            
            if (!product) {
              throw new Error(`Product not found: ${item.productId}`);
            }
            
            // Use variantOptions for pricing/stock (new structure)
            let selectedVariant = item.variantId 
              ? product.variantOptions.find((v: { id: number }) => v.id === item.variantId) || null
              : null;
            
            if (!selectedVariant) {
              selectedVariant = product.variantOptions[0] || null;
            }
            
            if (!selectedVariant) {
              throw new Error(`No variants found for product: ${item.productId}`);
            }
            const packageQuantity = item.packageQuantity || 1;
            // Get piecesPerPackage from item (piece-based system)
            const piecesPerPackageForMOQ = item.piecesPerPackage || 1;
            const totalPieces = packageQuantity * piecesPerPackageForMOQ;
            
            // Use variantOptions for pricing/stock (new structure)
            // MOQ validation is handled by validateOfferForProduct
            // Use the selected variant's selling price directly
            if (!selectedVariant || !(selectedVariant as { sellingPrice?: string }).sellingPrice) {
              throw new Error(`No variants with pricing found for product: ${item.productId}`);
            }
            
            // Validate MOQ if set on the variant
            const variantMOQ = (selectedVariant as { moq?: number }).moq;
            if (variantMOQ && totalPieces < variantMOQ) {
              throw new Error(`Minimum order quantity is ${variantMOQ} pieces. You ordered ${totalPieces} pieces.`);
            }
            
            // Use the new price parsing utility
            const consistentUnitPrice = parsePrice((selectedVariant as { sellingPrice: string }).sellingPrice);
            
            // Get package info from item (piece-based system)
            const piecesPerPackage = item.piecesPerPackage || 1;
            const packageType = item.packageType || 'Piece';
            const pricePerPackage = consistentUnitPrice * piecesPerPackage;
            const consistentSubtotal = packageQuantity * pricePerPackage;
            
            // Validate and get offer information with usage limits check
            const offerValidation = await validateOfferForProduct(
              product.productId,
              null, // marketplaceUserId will be handled in mobile orders API
              totalAmountCalc,
              packageQuantity * piecesPerPackage,
              tx,
              packageQuantity, // Pass package quantity for buy_x_get_y calculations
              selectedVariant as { sellingPrice: string; moq?: number } // Pass variant for accurate pricing
            );
            
            
            // Build variantNameSnapshot from variant attributes
            let variantNameSnapshot: string | null = null;
            if (selectedVariant && (selectedVariant as { attributes?: unknown }).attributes) {
              const attributes = (selectedVariant as { attributes: Record<string, string> }).attributes;
              variantNameSnapshot = Object.entries(attributes)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ');
            }
            
            // Initialize order item data with basic info
            let orderItemData: {
              orderId: string;
              productId: string;
              subtotal: number;
              packageType?: string | null;
              piecesPerPackage?: number;
              packageQuantity?: number;
              pricePerPackage?: number | null;
              productNameSnapshot?: string;
              productSkuSnapshot?: string;
              productTypeSnapshot?: string;
              variantId?: number | null;
              variantOptionId?: number | null;
              variantNameSnapshot?: string | null;
              offerApplied?: boolean;
              offerBadgeSnapshot?: string | null;
              offerNameSnapshot?: string | null;
              originalPriceSnapshot?: string | null;
              discountPercentage?: number | null;
              discountAmount?: number | null;
              promotionDetailsSnapshot?: string | null;
            } = {
              orderId: sanitizedData.orderId as string,
              productId: item.productId as string,
              subtotal: consistentSubtotal,
              packageType: packageType,
              piecesPerPackage: piecesPerPackage,
              packageQuantity: item.packageQuantity || 1,
              pricePerPackage: item.pricePerPackage || pricePerPackage,
              productNameSnapshot: product.name,
              productSkuSnapshot: product.sku,
              productTypeSnapshot: product.productType,
              variantId: item.variantId || null,
              variantOptionId: (selectedVariant as { id?: number }).id || null,
              variantNameSnapshot: variantNameSnapshot,
              offerApplied: false,
              offerBadgeSnapshot: null,
              offerNameSnapshot: null,
              originalPriceSnapshot: null,
              discountPercentage: null,
              discountAmount: null,
              promotionDetailsSnapshot: null
            };
            
            // If offer is valid, track usage and add snapshot data
            if (offerValidation.isValid && offerValidation.offerId) {
              // Add to used offer IDs for targeted deactivation
              if (!usedOfferIds.includes(offerValidation.offerId)) {
                usedOfferIds.push(offerValidation.offerId);
              }
              
              // Track offer usage - handle both single and multiple discount types
              if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
                // Multiple discount types (e.g., both discount and promotion)
                await trackOfferUsageForAllTypes(
                  offerValidation.offerId,
                  offerValidation.applicableDiscountTypes,
                  null, // marketplaceUserId
                  tx
                );
              } else if (offerValidation.discountTypeId) {
                // Single discount type
              await trackOfferUsageUtil(
                offerValidation.offerId,
                offerValidation.discountTypeId,
                null, // marketplaceUserId
                offerValidation.discountAmount || 0,
                tx
              );
              }
              
              // Add offer snapshot data
              orderItemData = {
                ...orderItemData,
                offerApplied: true,
                offerBadgeSnapshot: offerValidation.offerBadge || null,
                offerNameSnapshot: offerValidation.offerName || null,
                originalPriceSnapshot: offerValidation.originalPrice?.toString() || null,
                discountPercentage: offerValidation.discountPercentage || null,
                discountAmount: offerValidation.discountAmount || null,
                promotionDetailsSnapshot: offerValidation.promotionDetails 
                  ? JSON.stringify(offerValidation.promotionDetails)
                  : null
              };
              
            }
            
            return tx.orderItem.create({
              data: orderItemData
            });
          });
          
          await Promise.all(orderItemPromises);
          
          // Update product prices after all offer usage tracking is complete
          // Price updates are now handled by the offers API
        });
        
        // Update offer statuses after all offer usage tracking is complete
        // Only check offers that were actually used in this order
        if (usedOfferIds.length > 0) {
          await updateOfferStatusesBasedOnLimits(usedOfferIds);
        }
        
      } catch (orderItemError) {
        // Don't throw here, just log the error and continue
      }
    }
    
    // Build items from relational rows for response
    const enrichedOrderItems = (order.orderItemsRel || []).map((oi: {
      productId: string | null;
      subtotal: number;
      packageType?: string | null;
      piecesPerPackage?: number | null;
      packageQuantity?: number | null;
      pricePerPackage?: number | null;
      product?: { name: string; productType: string; brand: string; description: string; images: string[] } | null;
      productNameSnapshot?: string | null;
      productSkuSnapshot?: string | null;
      productTypeSnapshot?: string | null;
      variantNameSnapshot?: string | null;
      variantId?: number | null;
    }) => ({
      productId: oi.productId ?? null,
      subtotal: oi.subtotal,
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage,
      productName: oi.product?.name || (oi as { productNameSnapshot?: string }).productNameSnapshot || 'Unknown Product',
      category: (oi.product as { productType?: string })?.productType || (oi as { productTypeSnapshot?: string }).productTypeSnapshot || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: (oi as { productNameSnapshot?: string }).productNameSnapshot || null,
      productSkuSnapshot: (oi as { productSkuSnapshot?: string }).productSkuSnapshot || null,
      productTypeSnapshot: (oi as { productTypeSnapshot?: string }).productTypeSnapshot || null,
      // Offer snapshots from time of purchase
      offerApplied: (oi as { offerApplied?: boolean }).offerApplied || false,
      offerBadgeSnapshot: (oi as { offerBadgeSnapshot?: string | null }).offerBadgeSnapshot || null,
      offerNameSnapshot: (oi as { offerNameSnapshot?: string | null }).offerNameSnapshot || null,
      originalPriceSnapshot: (oi as { originalPriceSnapshot?: string | null }).originalPriceSnapshot || null,
      discountPercentage: (oi as { discountPercentage?: number | null }).discountPercentage || null,
      promotionDetailsSnapshot: (oi as { promotionDetailsSnapshot?: string | null }).promotionDetailsSnapshot || null
    }));

    // Auto-sync order to buyer profile if buyerId exists
    if (order.buyerId) {
      try {
        await syncOrderToBuyerProfile(order.buyerId, sanitizedData.userId as number);
      } catch (syncError) {
        // Log error but don't fail the order creation
      }
    }

    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch (error) {
      // Ignore broadcast errors
    }

    return NextResponse.json({ ...order, orderItems: enrichedOrderItems }, { status: 201, headers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500, headers }
    );
  }
}


// PUT /api/orders - Update order
export async function PUT(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();
    
    // Apply rate limiting for order updates: 50 per minute per user
    if (body.userId && !isNaN(Number(body.userId))) {
      const rateLimitResponse = await orderUpdateRateLimiter(request, Number(body.userId));
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    // Bulk archive support
    if (Array.isArray(body.archiveOrderIds) && body.archiveOrderIds.length > 0) {
      const baseWhere: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) baseWhere.userId = Number(body.userId);
      const updated = await prisma.order.updateMany({
        where: { ...baseWhere, orderId: { in: body.archiveOrderIds.map((v: unknown) => String(v)) } },
        data: { archivedAt: new Date() }
      });
      try {
        await broadcastOrderUpdate(body.archiveOrderIds.map((v: unknown) => String(v)));
      } catch (error) {
        // Ignore broadcast errors
      }
      return NextResponse.json({ success: true, count: updated.count }, { headers });
    }

    if (body.archive === true && (body.orderId || body.id)) {
      const where: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) where.userId = Number(body.userId);
      if (body.orderId) where.orderId = String(body.orderId);
      else if (body.id) where.id = Number(body.id);

      const archiveBroadcastIds: string[] = [];
      if (body.orderId) {
        archiveBroadcastIds.push(String(body.orderId));
      } else if (body.id) {
        const existing = await prisma.order.findUnique({
          where: { id: Number(body.id) },
          select: { orderId: true }
        });
        if (existing?.orderId) {
          archiveBroadcastIds.push(existing.orderId);
        }
      }

      let result = await prisma.order.updateMany({
        where,
        data: { archivedAt: new Date() }
      });
      if (result.count === 0) {
        // Retry without user filter
        let retryWhere: { orderId: string } | { id: number };
        if (body.orderId) {
          retryWhere = { orderId: String(body.orderId).trim() };
        } else if (body.id) {
          retryWhere = { id: Number(body.id) };
        } else {
          throw new Error('No orderId or id provided');
        }
        try {
          const single = await prisma.order.update({ where: retryWhere, data: { archivedAt: new Date() } });
          if (archiveBroadcastIds.length === 0 && single.orderId) {
            archiveBroadcastIds.push(single.orderId);
          }
          if (archiveBroadcastIds.length > 0) {
            try {
              await broadcastOrderUpdate(archiveBroadcastIds);
            } catch (error) {
              // Ignore broadcast errors
            }
          }
          return NextResponse.json({ success: true }, { headers });
        } catch (e) {
          return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
        }
      }
      if (archiveBroadcastIds.length > 0) {
        try {
          await broadcastOrderUpdate(archiveBroadcastIds);
        } catch (error) {
          // Ignore broadcast errors
        }
      }
      return NextResponse.json({ success: true }, { headers });
    }

    if ((body.unarchive === true || body.archive === false) && (body.orderId || body.id)) {
      const where: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) where.userId = Number(body.userId);
      if (body.orderId) where.orderId = String(body.orderId);
      else if (body.id) where.id = Number(body.id);

      const unarchiveBroadcastIds: string[] = [];
      if (body.orderId) {
        unarchiveBroadcastIds.push(String(body.orderId));
      } else if (body.id) {
        const existing = await prisma.order.findUnique({
          where: { id: Number(body.id) },
          select: { orderId: true }
        });
        if (existing?.orderId) {
          unarchiveBroadcastIds.push(existing.orderId);
        }
      }

      let result = await prisma.order.updateMany({
        where,
        data: { archivedAt: null }
      });
      if (result.count === 0) {
        // Retry without user filter
        let retryWhere: { orderId: string } | { id: number };
        if (body.orderId) {
          retryWhere = { orderId: String(body.orderId).trim() };
        } else if (body.id) {
          retryWhere = { id: Number(body.id) };
        } else {
          throw new Error('No orderId or id provided');
        }
        try {
          const single = await prisma.order.update({ where: retryWhere, data: { archivedAt: null } });
          if (unarchiveBroadcastIds.length === 0 && single.orderId) {
            unarchiveBroadcastIds.push(single.orderId);
          }
          if (unarchiveBroadcastIds.length > 0) {
            try {
              await broadcastOrderUpdate(unarchiveBroadcastIds);
            } catch (error) {
              // Ignore broadcast errors
            }
          }
          return NextResponse.json({ success: true }, { headers });
        } catch (e) {
          return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
        }
      }
      if (unarchiveBroadcastIds.length > 0) {
        try {
          await broadcastOrderUpdate(unarchiveBroadcastIds);
        } catch (error) {
          // Ignore broadcast errors
        }
      }
      return NextResponse.json({ success: true }, { headers });
    }

    // Cancel order functionality
    if (body.cancel === true && (body.orderId || body.id)) {
      // Find the order first
      let whereClause: { orderId: string } | { id: number };
      if (body.orderId) {
        whereClause = { orderId: String(body.orderId).trim() };
      } else if (body.id) {
        whereClause = { id: Number(body.id) };
      } else {
        return NextResponse.json({ error: 'No orderId or id provided' }, { status: 400, headers });
      }

      // Check if order exists and is cancellable
      const existingOrder = await prisma.order.findFirst({
        where: whereClause
      });

      if (!existingOrder) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }

      // Check if order can be cancelled (only Pending or Confirmed orders)
      const cancellableStatuses = ['Pending', 'Confirmed'];
      if (!cancellableStatuses.includes(existingOrder.orderStatus)) {
        return NextResponse.json({ 
          error: `Order cannot be cancelled. Current status: ${existingOrder.orderStatus}` 
        }, { status: 400, headers });
      }

      // Update order with cancellation data
      const updateData = {
        orderStatus: 'Cancelled',
        cancelledAt: new Date(),
        cancelledBy: body.cancelledBy || body.userId?.toString() || 'User',
        cancellationReason: body.reason || body.cancellationReason || 'User requested cancellation'
      };

      try {
        const updatedOrder = await prisma.order.update({ 
          where: whereClause, 
          data: updateData 
        });
        
        // Auto-sync order to buyer profile after cancellation
        if (updatedOrder.buyerId && body.userId) {
          try {
            await syncOrderToBuyerProfile(updatedOrder.buyerId, Number(body.userId));
          } catch (syncError) {
          }
        }

        try {
          await broadcastOrderUpdate([updatedOrder.orderId]);
        } catch (error) {
          // Ignore broadcast errors
        }
        await broadcastSoldCountUpdates(updatedOrder.orderId);

        return NextResponse.json({ 
          success: true, 
          message: 'Order cancelled successfully',
          order: {
            orderId: updatedOrder.orderId,
            orderStatus: updatedOrder.orderStatus,
            cancelledAt: updatedOrder.cancelledAt
          }
        }, { headers });
      } catch (e) {
        return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500, headers });
      }
    }

    // Skip orderId requirement for archive/unarchive/cancel operations
    if (!body.orderId && !body.archive && !body.unarchive && !body.cancel && !Array.isArray(body.archiveOrderIds)) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400, headers }
      );
    }
    
    // Skip validation for archive/unarchive/cancel operations  
    if (!body.archive && !body.unarchive && !body.cancel && !Array.isArray(body.archiveOrderIds)) {
      // Validate update data
      const validation = validateOrderUpdate(body);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400, headers }
        );
      }
    }
    
    // Sanitize update data
    const sanitizedData = sanitizeOrderData(body);
    
    // Recalculate entire order if orderItems are provided
    let recalculatedData = { ...sanitizedData };
    if (sanitizedData.orderItems) {
      const orderItems = Array.isArray(sanitizedData.orderItems) ? sanitizedData.orderItems : [];
      const consistentOrderItems = await ensureAllPriceConsistency(orderItems);
      const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
      const totalQtyCalc = consistentOrderItems.reduce((sum, it) => {
        const piecesPerPackage = it.piecesPerPackage || 1;
        const packageQuantity = it.packageQuantity || 1;
        return sum + (packageQuantity * piecesPerPackage);
      }, 0);
      recalculatedData = {
        ...sanitizedData,
        subtotal: subtotalCalc,
        totalAmount: subtotalCalc + Number(sanitizedData.shippingFee || 0) - Number(sanitizedData.discounts || 0),
        totalOrders: totalQtyCalc,
        orderItems: JSON.stringify(consistentOrderItems)
      };
    }
    
    // Convert orderItems to JSON string if provided
    const updateData: Record<string, unknown> = recalculatedData;
    if (sanitizedData.orderDate) {
      updateData.orderDate = new Date(String(sanitizedData.orderDate));
    }
    if (sanitizedData.acceptedAt) {
      updateData.acceptedAt = new Date(String(sanitizedData.acceptedAt));
    }

    // Auto-set acceptedAt on status transition to Confirmed when not provided
    if (!sanitizedData.acceptedAt && typeof sanitizedData.orderId === 'string' && sanitizedData.orderStatus) {
      const existing = await prisma.order.findUnique({ where: { orderId: String(sanitizedData.orderId) } });
      if (existing) {
        const nextStatus = String(sanitizedData.orderStatus);
        const prevStatus = String(existing.orderStatus || '');
        if (nextStatus === 'Confirmed' && !existing.acceptedAt) {
          updateData.acceptedAt = new Date();
          if (!sanitizedData.acceptedBy && !existing.acceptedBy) {
            updateData.acceptedBy = 'Admin';
          }
        }

        // Auto-wire deliveryConfirmation based on orderStatus if not explicitly provided
        if (!sanitizedData.deliveryConfirmation) {
          if (nextStatus === 'Pending') {
            updateData.deliveryConfirmation = 'pending';
          } else if (nextStatus === 'Confirmed') {
            updateData.deliveryConfirmation = 'confirmed';
          } else if (nextStatus === 'Shipped' || nextStatus === 'Packed') {
            updateData.deliveryConfirmation = 'in_transit';
          } else if (nextStatus === 'Delivered') {
            updateData.deliveryConfirmation = 'delivered';
          } else if (nextStatus === 'Cancelled' || nextStatus === 'Returned') {
            updateData.deliveryConfirmation = nextStatus.toLowerCase();
          }
        }

        // Clear cancellation fields when order status changes from 'Cancelled' to any other status
        if (prevStatus === 'Cancelled' && nextStatus !== 'Cancelled') {
          updateData.cancelledAt = null;
          updateData.cancelledBy = null;
          updateData.cancellationReason = null;
          updateData.isDeleted = false; // Also reset the soft delete flag
        }
        
        // STOCK MANAGEMENT: Simple logic based on status
        const orderWithItems = await prisma.order.findUnique({
          where: { orderId: String(sanitizedData.orderId) },
          include: {
            orderItemsRel: true
          }
        });
        
        const noDeductStatuses = ['Pending', 'Cancelled', 'Returned'];
        const prevStatusNoDeduct = noDeductStatuses.includes(prevStatus);
        const nextStatusNoDeduct = noDeductStatuses.includes(nextStatus);
        
        // RESTORE STOCK: Moving TO Pending, Cancelled, or Returned from any other status
        if (!prevStatusNoDeduct && nextStatusNoDeduct && orderWithItems) {
          for (const orderItem of orderWithItems.orderItemsRel) {
            if (!orderItem.productId) continue;
            
            const product = await prisma.product.findFirst({
              where: { productId: orderItem.productId }
            });
            
            if (!product) continue;
            
            // Calculate total quantity to restore (including free items from promotion)
            const orderedQty = orderItem.packageQuantity || 1;
            let totalQtyToRestore = orderedQty;
            
            // Check if there's a Buy X Get Y promotion
            if (orderItem.promotionDetailsSnapshot) {
              try {
                const promoDetails = JSON.parse(orderItem.promotionDetailsSnapshot);
                const minQty = promoDetails.minQuantity || 1;
                const freeQty = promoDetails.freeQuantity || 0;
                
                // Calculate free items
                const qualifyingSets = Math.floor(orderedQty / minQty);
                const totalFreeItems = qualifyingSets * freeQty;
                totalQtyToRestore = orderedQty + totalFreeItems;
              } catch (e) {
                // Invalid JSON, just use ordered quantity
              }
            }
            
            // Get the product and variant for stock restoration
            const productForRestore = await prisma.product.findFirst({
              where: { productId: orderItem.productId || '' },
              include: { variantOptions: true, variants: true }
            });
            
            if (!productForRestore) {
              continue; // Skip if product not found
            }
            
            // Find the specific variant to restore stock to
            // Priority: 1) variantOptionId, 2) variantId, 3) match by variantNameSnapshot attributes, 4) first variant
            let variantToRestore = null;
            
            // First try variantOptionId (most accurate)
            if (orderItem.variantOptionId) {
              variantToRestore = productForRestore.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantOptionId
              ) || null;
            }
            
            // If not found, try variantId
            if (!variantToRestore && orderItem.variantId) {
              variantToRestore = productForRestore.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantId
              ) || null;
            }
            
            // If still not found, try to match by variantNameSnapshot attributes
            if (!variantToRestore && orderItem.variantNameSnapshot) {
              try {
                // Parse variantNameSnapshot (format: "Color: Gray, Size: L" or "Color: Gray")
                const variantAttributes: Record<string, string> = {};
                const variantNameParts = orderItem.variantNameSnapshot.split(', ');
                variantNameParts.forEach((part: string) => {
                  const [key, ...valueParts] = part.split(': ');
                  if (key && valueParts.length > 0) {
                    variantAttributes[key.trim()] = valueParts.join(': ').trim();
                  }
                });
                
                // Find variant that matches all attributes
                variantToRestore = productForRestore.variantOptions.find((v: { attributes?: unknown }) => {
                  if (!v.attributes) return false;
                  const vAttributes = v.attributes as Record<string, string>;
                  return Object.entries(variantAttributes).every(([key, value]) => {
                    return vAttributes[key] === value;
                  });
                }) || null;
              } catch (e) {
                // Invalid variantNameSnapshot format, continue to fallback
              }
            }
            
            // Last resort: use first variant
            if (!variantToRestore) {
              variantToRestore = productForRestore.variantOptions[0] || null;
            }
            
            if (!variantToRestore) {
              continue; // Skip if no variant found
            }
            
            // Restore stock at variant level (piece-based system)
            const newStock = ((variantToRestore as { stockQuantity?: number }).stockQuantity || 0) + totalQtyToRestore;
            let newStockStatus = (variantToRestore as { stockStatus?: string }).stockStatus || 'In Stock';
            
            // Update stock status based on threshold
            const lowStockThreshold = (variantToRestore as { lowStockThreshold?: number }).lowStockThreshold || 0;
            if (newStock <= 0) {
              newStockStatus = 'Out of Stock';
            } else if (lowStockThreshold > 0 && newStock <= lowStockThreshold) {
              newStockStatus = 'Low Stock';
            } else {
              newStockStatus = 'In Stock';
            }
            
            // Update using variantOption model
            await prisma.variantOption.update({
              where: { id: (variantToRestore as { id: number }).id },
              data: {
                stockQuantity: newStock,
                stockStatus: newStockStatus
              }
            });
          }
        }
        
        // DEDUCT STOCK: Moving FROM Pending, Cancelled, or Returned TO any other status
        if (prevStatusNoDeduct && !nextStatusNoDeduct && orderWithItems) {
          for (const orderItem of orderWithItems.orderItemsRel) {
            if (!orderItem.productId) continue;
            
            const product = await prisma.product.findFirst({
              where: { productId: orderItem.productId }
            });
            
            if (!product) continue;
            
            // Calculate total quantity to deduct (including free items from promotion)
            const orderedQty = orderItem.packageQuantity || 1;
            let totalQtyToDeduct = orderedQty;
            
            // Check if there's a Buy X Get Y promotion
            if (orderItem.promotionDetailsSnapshot) {
              try {
                const promoDetails = JSON.parse(orderItem.promotionDetailsSnapshot);
                const minQty = promoDetails.minQuantity || 1;
                const freeQty = promoDetails.freeQuantity || 0;
                
                // Calculate free items
                const qualifyingSets = Math.floor(orderedQty / minQty);
                const totalFreeItems = qualifyingSets * freeQty;
                totalQtyToDeduct = orderedQty + totalFreeItems;
              } catch (e) {
                // Invalid JSON, just use ordered quantity
              }
            }
            
            // Get the product and variant for stock deduction
            const productForDeduct = await prisma.product.findFirst({
              where: { productId: orderItem.productId || '' },
              include: { variantOptions: true, variants: true }
            });
            
            if (!productForDeduct) {
              continue; // Skip if product not found
            }
            
            // Find the specific variant to deduct stock from
            // Priority: 1) variantOptionId, 2) variantId, 3) match by variantNameSnapshot attributes, 4) first variant
            let variantToDeduct = null;
            
            // First try variantOptionId (most accurate)
            if (orderItem.variantOptionId) {
              variantToDeduct = productForDeduct.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantOptionId
              ) || null;
            }
            
            // If not found, try variantId
            if (!variantToDeduct && orderItem.variantId) {
              variantToDeduct = productForDeduct.variantOptions.find(
                (v: { id: number }) => v.id === orderItem.variantId
              ) || null;
            }
            
            // If still not found, try to match by variantNameSnapshot attributes
            if (!variantToDeduct && orderItem.variantNameSnapshot) {
              try {
                // Parse variantNameSnapshot (format: "Color: Gray, Size: L" or "Color: Gray")
                const variantAttributes: Record<string, string> = {};
                const variantNameParts = orderItem.variantNameSnapshot.split(', ');
                variantNameParts.forEach((part: string) => {
                  const [key, ...valueParts] = part.split(': ');
                  if (key && valueParts.length > 0) {
                    variantAttributes[key.trim()] = valueParts.join(': ').trim();
                  }
                });
                
                // Find variant that matches all attributes
                variantToDeduct = productForDeduct.variantOptions.find((v: { attributes?: unknown }) => {
                  if (!v.attributes) return false;
                  const vAttributes = v.attributes as Record<string, string>;
                  return Object.entries(variantAttributes).every(([key, value]) => {
                    return vAttributes[key] === value;
                  });
                }) || null;
              } catch (e) {
                // Invalid variantNameSnapshot format, continue to fallback
              }
            }
            
            // Last resort: use first variant
            if (!variantToDeduct) {
              variantToDeduct = productForDeduct.variantOptions[0] || null;
            }
            
            if (!variantToDeduct) {
              continue; // Skip if no variant found
            }
            
            // Deduct stock at variant level (piece-based system)
            const newStock = ((variantToDeduct as { stockQuantity?: number }).stockQuantity || 0) - totalQtyToDeduct;
            let newStockStatus = (variantToDeduct as { stockStatus?: string }).stockStatus || 'In Stock';
            
            // Update stock status based on threshold
            const lowStockThreshold = (variantToDeduct as { lowStockThreshold?: number }).lowStockThreshold || 0;
            if (newStock <= 0) {
              newStockStatus = 'Out of Stock';
            } else if (lowStockThreshold > 0 && newStock <= lowStockThreshold) {
              newStockStatus = 'Low Stock';
            } else {
              newStockStatus = 'In Stock';
            }
            
            // Update using variantOption model
            await prisma.variantOption.update({
              where: { id: (variantToDeduct as { id: number }).id },
              data: {
                stockQuantity: Math.max(0, newStock),
                stockStatus: newStockStatus
              }
            });
          }
        }
      }
    }
    
    // For backward compatibility, don't require userId for updates
    const order = await prisma.order.update({
      where: { orderId: String(sanitizedData.orderId) },
      data: updateData,
      include: {
        buyer: true,
        user: true,
        orderItemsRel: false
      }
    });

    // Update OrderItem records if orderItems were provided
    if (sanitizedData.orderItems && Array.isArray(sanitizedData.orderItems)) {
      // Delete existing OrderItem records for this order
      await prisma.orderItem.deleteMany({
        where: { orderId: sanitizedData.orderId as string }
      });
      
      // Create new OrderItem records with price consistency
      const orderItemPromises = (sanitizedData.orderItems as Array<{ productId: string; quantity: number }>).map(async (item: { productId: string; quantity: number }) => {
        // Fetch the product with variants to ensure price consistency
        const product = await prisma.product.findFirst({
          where: { productId: item.productId },
          include: { variantOptions: true, variants: true }
        });
        
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        // Use the first variant's sellingPrice as the unitPrice to ensure consistency
        // Use variantOptions for pricing/stock (new structure)
        const firstVariant = product.variantOptions[0] || null;
        if (!firstVariant || !(firstVariant as { sellingPrice?: string }).sellingPrice) {
          throw new Error(`No variants with pricing found for product: ${item.productId}`);
        }
        
        // Use the centralized price parsing utility
        const consistentUnitPrice = parsePrice((firstVariant as { sellingPrice: string }).sellingPrice);
        const consistentSubtotal = consistentUnitPrice * Number(item.quantity || 0);
        
        return prisma.orderItem.create({
          data: {
            orderId: sanitizedData.orderId as string,
            productId: item.productId as string,
            subtotal: consistentSubtotal,
            productNameSnapshot: product.name,
            productSkuSnapshot: product.sku,
            productTypeSnapshot: product.productType,
            packageQuantity: (item as { packageQuantity?: number }).packageQuantity || 1,
            packageType: (item as { packageType?: string }).packageType,
            piecesPerPackage: (item as { piecesPerPackage?: number }).piecesPerPackage || 1,
            pricePerPackage: (item as { pricePerPackage?: number }).pricePerPackage || consistentUnitPrice
          }
        });
      });
      
      await Promise.all(orderItemPromises);
    }

    // Build items from relational rows for response
    const enrichedOrderItemsUpdate = ((order as { orderItemsRel?: Array<{ productId: string | null; subtotal: number; packageQuantity?: number; packageType?: string; piecesPerPackage?: number; pricePerPackage?: number; product?: { name: string; productType: string; brand: string; description: string; images: string[] } | null; productNameSnapshot?: string; productSkuSnapshot?: string; productTypeSnapshot?: string }> }).orderItemsRel || []).map((oi) => ({
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
      productTypeSnapshot: oi.productTypeSnapshot || null
    }));

    // Auto-sync order to buyer profile if buyerId exists and order was updated
    if (order.buyerId && sanitizedData.userId) {
      try {
        await syncOrderToBuyerProfile(order.buyerId, sanitizedData.userId as number);
      } catch (syncError) {
        // Log error but don't fail the order update
      }
    }

    try {
      await broadcastOrderUpdate([order.orderId]);
    } catch (error) {
      // Ignore broadcast errors
    }
    if (sanitizedData.orderStatus || sanitizedData.orderItems) {
      await broadcastSoldCountUpdates(order.orderId);
    }

    return NextResponse.json({ ...order, orderItems: enrichedOrderItemsUpdate }, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to update order', detail: String(error instanceof Error ? error.message : error) }, 
      { status: 500, headers }
    );
  }
}

// DELETE /api/orders - Delete order
export async function DELETE(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();
    
    // Apply rate limiting for order deletions: 50 per minute per user
    if (body.userId && !isNaN(Number(body.userId))) {
      const rateLimitResponse = await orderUpdateRateLimiter(request, Number(body.userId));
      if (rateLimitResponse) {
        return rateLimitResponse;
      }
    }
    
    if (!body.orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400, headers }
      );
    }
    
    // Validate order ID format
    const { validateOrderId } = await import('@/utils/order-security');
    if (!validateOrderId(String(body.orderId))) {
      return NextResponse.json(
        { error: 'Invalid order ID format' },
        { status: 400, headers }
      );
    }
    

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // First, reverse any offer usage before deleting the order
      await reverseOfferUsage(body.orderId, tx);
      
      // Delete OrderItem records first (due to foreign key constraint)
      await tx.orderItem.deleteMany({
        where: { orderId: body.orderId }
      });
      
      // Delete the order
      await tx.order.delete({
        where: { orderId: body.orderId }
      });
    });

    try {
      if (body.orderId) {
        await broadcastOrderUpdate([String(body.orderId)]);
      }
    } catch (error) {
      // Ignore broadcast errors
    }

    return NextResponse.json({ message: 'Order deleted successfully' }, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500, headers }
    );
  }
}
