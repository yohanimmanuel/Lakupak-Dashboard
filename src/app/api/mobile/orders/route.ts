import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '../../../../generated/prisma';
import { 
  getSecurityHeaders, 
  validateAuthInput 
} from '../../../../utils/auth-security';
import { validateOfferForProduct, trackOfferUsage as trackOfferUsageUtil, trackOfferUsageForAllTypes, updateOfferStatusesBasedOnLimits } from '../../../../utils/offerValidation';
import { parseNumberByCurrency } from '../../../../config/currencyConfig';
import { validateVariant, parseVariantPrice } from '../../../../services/variantService';
import { parsePrice } from '../../../../utils/currencyUtils';
import { syncOrderToBuyerProfile, buildMobileBuyerId } from '../../../../utils/buyerSync';
// Inline function to avoid circular imports

interface OrderItemInput {
  productId: string;
  quantity: number;
  priceAtPurchase: string;
  subtotal: string;
  packageType?: string;
  piecesPerPackage?: number;
  packageQuantity?: number;
  pricePerPackage?: string;
  productName?: string;
  productSku?: string;
  variantId?: number;
  variantName?: string;
  category?: string;
}

const prisma = new PrismaClient();

// GET /api/mobile/orders - Get mobile marketplace user's orders
export async function GET(request: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Verify JWT token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401, headers }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT token
    const { verifyAccessToken } = await import('../../../../lib/jwt');
    let tokenUserId: number;
    try {
      const payload = verifyAccessToken(token);
      tokenUserId = payload.sub;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Validate userId
    if (!userId || isNaN(Number(userId))) {
      return NextResponse.json(
        { error: 'Valid user ID is required' },
        { status: 400, headers }
      );
    }
    
    const userIdNum = Number(userId);

    // Verify that the token user ID matches the requested user ID
    if (tokenUserId !== userIdNum) {
      return NextResponse.json(
        { error: 'Unauthorized access to user data' },
        { status: 403, headers }
      );
    }
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400, headers }
      );
    }
    
    const skip = (page - 1) * limit;
    
    // Get orders for the marketplace user
    // For now, we'll create a simple orders system using the existing Order table
    // but we'll filter by buyerId that matches the marketplace user's info
    
    // First, get the marketplace user to get their details
    const marketplaceUser = await prisma.marketplaceUser.findUnique({
      where: { id: userIdNum }
    });
    
    if (!marketplaceUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers }
      );
    }
    
    // Find orders for this marketplace user by buyerId
    // We now create per-distributor buyerIds: LKB-<userId>-<distributorId>
    // So fetch any order whose buyerId starts with the base pattern
    const baseBuyerId = buildMobileBuyerId(marketplaceUser.id);
    
    const orders = await prisma.order.findMany({
      where: {
        buyerId: {
          startsWith: baseBuyerId
        }
      },
      skip,
      take: limit,
      orderBy: { orderDate: 'desc' },
      include: {
        orderItemsRel: {
          include: {
            product: true
          }
        }
      }
    });
    
    const total = await prisma.order.count({
      where: {
        buyerId: {
          startsWith: baseBuyerId
        }
      }
    });
    
    // Transform orders to include order items
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
        // Offer snapshots from time of purchase
        offerApplied: oi.offerApplied || false,
        offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
        offerNameSnapshot: oi.offerNameSnapshot || null,
        originalPriceSnapshot: oi.originalPriceSnapshot || null,
        discountPercentage: oi.discountPercentage || null,
        discountAmount: oi.discountAmount || null,
        promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null,
        moqSnapshot: oi.moqSnapshot || null
      }));
      
      return {
        ...order,
        orderItems: orderItems
      };
    });
    
    return NextResponse.json({
      orders: ordersWithItems,
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

// POST /api/mobile/orders - Create new order for mobile marketplace user
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    // Verify JWT token and bind request to authenticated marketplace user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401, headers }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const { verifyAccessToken } = await import('../../../../lib/jwt');
    let tokenUserId: number;
    try {
      const payload = verifyAccessToken(token);
      tokenUserId = payload.sub;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401, headers }
      );
    }

    const body = await request.json();
    
    const { 
      orderId, 
      buyerId, 
      orderDate, 
      distributorUserId: distributorUserIdFromClient,
      orderItems, 
      subtotal, 
      discounts, 
      shippingFee, 
      totalAmount, 
      totalOrders, 
      contactPerson, 
      storeName, 
      contactPhone, 
      customerEmail, 
      deliveryAddress, 
      deliveryMethod, 
      deliveryOption,
      orderStatus, 
      paymentStatus, 
      paymentTerms, 
      preferredDeliveryDate,
      preferredDeliveryTime,
      preferredPickupDate,
      preferredPickupTime,
      shippingMethodLabel,
      shippingMethod,
      userId 
    } = body;
    
    // Validate required fields
    if (!orderId || !userId) {
      return NextResponse.json(
        { error: 'Order ID and User ID are required' },
        { status: 400, headers }
      );
    }
    
    // Validate userId
    const userIdNum = Number(userId);
    if (isNaN(userIdNum)) {
      return NextResponse.json(
        { error: 'Invalid user ID format' },
        { status: 400, headers }
      );
    }
    
    // Check if marketplace user exists
    const marketplaceUser = await prisma.marketplaceUser.findUnique({
      where: { id: userIdNum }
    });
    // Enforce that the authenticated user matches the target userId in the payload
    if (tokenUserId !== userIdNum) {
      return NextResponse.json(
        { error: 'Unauthorized access to user data' },
        { status: 403, headers }
      );
    }
    
    if (!marketplaceUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers }
      );
    }
    
    const normalizeDeliveryOption = (value: unknown) => {
      if (!value) return null;
      const trimmed = String(value).trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : null;
    };

    const parseOptionalDate = (value: unknown) => {
      if (!value) return null;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const normalizeTimeValue = (value: unknown) => {
      if (!value) return null;
      const trimmed = String(value).trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const normalizedDeliveryOption = normalizeDeliveryOption(deliveryOption);
    const normalizedShippingLabel = typeof shippingMethodLabel === 'string' && shippingMethodLabel.trim().length > 0
      ? shippingMethodLabel.trim()
      : null;
    const normalizedShippingMethod = typeof shippingMethod === 'string' && shippingMethod.trim().length > 0
      ? shippingMethod.trim()
      : normalizedShippingLabel;
    const normalizedPreferredDeliveryDate = parseOptionalDate(preferredDeliveryDate);
    const normalizedPreferredPickupDate = parseOptionalDate(preferredPickupDate);
    const normalizedPreferredDeliveryTime = normalizeTimeValue(preferredDeliveryTime);
    const normalizedPreferredPickupTime = normalizeTimeValue(preferredPickupTime);

    // If client specifies distributorUserId, treat payload as a single-distributor order
    // Validate that all items actually belong to that distributor
    if (typeof distributorUserIdFromClient === 'number') {
      const productIds = Array.isArray(orderItems) ? orderItems.map((i: OrderItemInput) => String(i.productId)) : [];
      if (productIds.length === 0) {
        return NextResponse.json(
          { error: 'Order items required' },
          { status: 400, headers }
        );
      }
      const products = await prisma.product.findMany({
        where: { productId: { in: productIds } },
        select: { productId: true, userId: true }
      });
      const mismatched = products.find(p => p.userId !== distributorUserIdFromClient);
      if (mismatched) {
        return NextResponse.json(
          { error: `Product ${mismatched.productId} does not belong to distributor ${distributorUserIdFromClient}` },
          { status: 400, headers }
        );
      }

      // Proceed to create a single order attributed to the provided distributor
      const buyerPerDistributorId = buildMobileBuyerId(marketplaceUser.id, distributorUserIdFromClient);

      await prisma.buyer.upsert({
        where: { buyerId: buyerPerDistributorId },
        update: {
          owner: marketplaceUser.name || 'Mobile User',
          email: marketplaceUser.email || '',
          phone: marketplaceUser.phone || '',
          storeName: marketplaceUser.storeName || 'Mobile Store',
          address: marketplaceUser.chosenAddress || '',
          userId: distributorUserIdFromClient,
        },
        create: {
          buyerId: buyerPerDistributorId,
          owner: marketplaceUser.name || 'Mobile User',
          email: marketplaceUser.email || '',
          phone: marketplaceUser.phone || '',
          storeName: marketplaceUser.storeName || 'Mobile Store',
          businessType: 'Retailer',
          address: marketplaceUser.chosenAddress || '',
          status: 'Active',
          userId: distributorUserIdFromClient,
        }
      });

      const groupSubtotal = Array.isArray(orderItems)
        ? orderItems.reduce((sum: number, it: OrderItemInput) => sum + parseFloat(String(it.subtotal || 0)), 0)
        : 0;
      const groupTotalOrders = Array.isArray(orderItems)
        ? orderItems.reduce((sum: number, it: OrderItemInput) => sum + parseInt(String(it.packageQuantity || 1)), 0)
        : 0;
      const groupShipping = parseFloat(String(shippingFee || 0));
      const groupDiscounts = parseFloat(String(discounts || 0));
      const groupTotalAmount = groupSubtotal + groupShipping - groupDiscounts;

      const groupOrderId = String(orderId);
      const orderData = {
        orderId: groupOrderId,
        buyerId: buyerPerDistributorId,
        buyerIdSnapshot: buyerPerDistributorId,
        orderDate: new Date(orderDate || new Date()),
        orderDateSnapshot: new Date(orderDate || new Date()),
        orderStatus: String(orderStatus || 'Pending'),
        paymentStatus: String(paymentStatus || 'Unpaid'),
        deliveryMethod: String(deliveryMethod || 'Distributor Fleet'),
        deliveryOption: normalizedDeliveryOption,
        subtotal: groupSubtotal,
        discounts: groupDiscounts,
        shippingFee: groupShipping,
        totalAmount: groupTotalAmount,
        paymentTerms: String(paymentTerms || 'Cash on Delivery'),
        totalOrders: groupTotalOrders,
        contactPerson: String(contactPerson || marketplaceUser.name || ''),
        contactPersonSnapshot: String(contactPerson || marketplaceUser.name || ''),
        storeName: String(storeName || marketplaceUser.storeName || ''),
        storeNameSnapshot: String(storeName || marketplaceUser.storeName || ''),
        contactPhone: String(contactPhone || marketplaceUser.phone || ''),
        contactPhoneSnapshot: String(contactPhone || marketplaceUser.phone || ''),
        customerEmail: customerEmail ? String(customerEmail) : (marketplaceUser.email || ''),
        customerEmailSnapshot: customerEmail ? String(customerEmail) : (marketplaceUser.email || ''),
        deliveryAddress: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
        deliveryAddressSnapshot: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
        preferredDeliveryDate: normalizedPreferredDeliveryDate,
        preferredDeliveryTime: normalizedPreferredDeliveryTime,
        preferredPickupDate: normalizedPreferredPickupDate,
        preferredPickupTime: normalizedPreferredPickupTime,
        shippingMethodLabel: normalizedShippingLabel,
        shippingMethod: normalizedShippingMethod,
        userId: distributorUserIdFromClient
      };
      const order = await prisma.order.create({ data: orderData });

      if (Array.isArray(orderItems) && orderItems.length > 0) {
        const usedOfferIds: string[] = [];
        await prisma.$transaction(async (tx) => {
          const orderItemPromises = orderItems.map(async (item: OrderItemInput) => {
            const product = await tx.product.findFirst({
              where: { productId: String(item.productId || '') },
              include: { variants: true, variantOptions: true }
            });
            if (!product) throw new Error(`Product not found: ${item.productId}`);
            const variantOption = item.variantId ? (product.variantOptions?.find(vo => vo.id === item.variantId) || product.variantOptions?.[0]) : product.variantOptions?.[0];
            if (!variantOption) throw new Error(`No variant options found for product: ${item.productId}.`);
            const packageQuantity = parseInt(String(item.packageQuantity || 1));
            const piecesPerPackage = parseInt(String(item.piecesPerPackage || 1));
            const totalQuantity = packageQuantity * piecesPerPackage;
            const orderTotal = groupTotalAmount;
            const offerValidation = await validateOfferForProduct(
              product.productId,
              userIdNum,
              orderTotal,
              totalQuantity,
              tx,
              packageQuantity,
              variantOption
            );
            let orderItemData = {
              orderId: order.orderId,
              productId: String(item.productId || ''),
              subtotal: parseFloat(String(item.subtotal || 0)),
              packageType: String(item.packageType || 'Box'),
              piecesPerPackage: piecesPerPackage,
              packageQuantity: packageQuantity,
              pricePerPackage: parseFloat(String(item.pricePerPackage || 0)),
              productNameSnapshot: String(item.productName || 'Unknown Product'),
              productSkuSnapshot: String(item.productSku || ''),
              productTypeSnapshot: String(item.category || 'Uncategorized'),
              variantNameSnapshot: String(item.variantName || 'Default'),
              offerApplied: false,
              offerBadgeSnapshot: null as string | null,
              offerNameSnapshot: null as string | null,
              originalPriceSnapshot: null as string | null,
              discountPercentage: null as number | null,
              discountAmount: null as number | null,
              promotionDetailsSnapshot: null as string | null,
              moqSnapshot: variantOption.moq || null
            };
            if (offerValidation.isValid && offerValidation.offerId) {
              if (!usedOfferIds.includes(offerValidation.offerId)) usedOfferIds.push(offerValidation.offerId);
              if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
                await trackOfferUsageForAllTypes(offerValidation.offerId, offerValidation.applicableDiscountTypes, userIdNum, tx);
              } else if (offerValidation.discountTypeId) {
                await trackOfferUsageUtil(offerValidation.offerId, offerValidation.discountTypeId, userIdNum, offerValidation.discountAmount || 0, tx);
              }
              orderItemData = {
                ...orderItemData,
                offerApplied: true,
                offerBadgeSnapshot: offerValidation.offerBadge || null,
                offerNameSnapshot: offerValidation.offerName || null,
                originalPriceSnapshot: offerValidation.originalPrice?.toString() || null,
                discountPercentage: offerValidation.discountPercentage || null,
                discountAmount: offerValidation.discountAmount || null,
                promotionDetailsSnapshot: offerValidation.promotionDetails ? JSON.stringify(offerValidation.promotionDetails) : null
              };
            }
            return tx.orderItem.create({ data: orderItemData });
          });
          await Promise.all(orderItemPromises);
        });
        if (usedOfferIds.length > 0) {
          await updateOfferStatusesBasedOnLimits(usedOfferIds);
        }
      }

      try { await syncOrderToBuyerProfile(buyerPerDistributorId, distributorUserIdFromClient); } catch {}

      const createdOrdersFull = await prisma.order.findMany({
        where: { orderId: { in: [order.orderId] } },
        include: { orderItemsRel: { include: { product: true } } }
      });
      return NextResponse.json({ success: true, orders: createdOrdersFull, order: createdOrdersFull[0] }, { status: 201, headers: { ...headers, 'Cache-Control': 'no-store, no-cache, must-revalidate, private' } });
    }

    // Group items by distributor userId (seller) so each seller receives their own order
    // Ignore any incoming buyerId from the client – we always build per-distributor IDs server-side
    const distributorToItems: Map<number, OrderItemInput[]> = new Map();
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      // Fetch the owner (userId) for all products in the order
      const productIds = orderItems.map(item => String(item.productId));
      const products = await prisma.product.findMany({
        where: { productId: { in: productIds } },
        select: { productId: true, userId: true }
      });
      const productIdToUserId = new Map<string, number>();
      products.forEach(p => { if (p.userId) productIdToUserId.set(p.productId, p.userId); });
      
      for (const item of orderItems) {
        const ownerId = productIdToUserId.get(String(item.productId));
        if (!ownerId) {
          // Do not silently drop items; fail fast so orders never get mis-attributed
          return NextResponse.json(
            { error: `Unable to resolve distributor for product ${String(item.productId)}. Please retry.` },
            { status: 400, headers }
          );
        }
        if (!distributorToItems.has(ownerId)) distributorToItems.set(ownerId, []);
        distributorToItems.get(ownerId)!.push(item as OrderItemInput);
      }
    }
    
    if (distributorToItems.size === 0) {
      return NextResponse.json(
        { error: 'Unable to determine distributors for products' },
        { status: 400, headers }
      );
    }
    
    // Create one order per distributor group
    const createdOrders: Array<{ orderId: string }> = [];
    let groupIndex = 0;
    for (const [distributorUserId, itemsForDistributor] of distributorToItems.entries()) {
      groupIndex += 1;
      // Always use a per-distributor buyerId so attribution never collides
      const baseBuyerId = buildMobileBuyerId(marketplaceUser.id);
      const buyerPerDistributorId = buildMobileBuyerId(marketplaceUser.id, distributorUserId);
      // Upsert the distributor-scoped buyer record
      await prisma.buyer.upsert({
        where: { buyerId: buyerPerDistributorId },
        update: {
          owner: marketplaceUser.name || 'Mobile User',
          email: marketplaceUser.email || '',
          phone: marketplaceUser.phone || '',
          storeName: marketplaceUser.storeName || 'Mobile Store',
          address: marketplaceUser.chosenAddress || '',
          userId: distributorUserId,
        },
        create: {
          buyerId: buyerPerDistributorId,
          owner: marketplaceUser.name || 'Mobile User',
          email: marketplaceUser.email || '',
          phone: marketplaceUser.phone || '',
          storeName: marketplaceUser.storeName || 'Mobile Store',
          businessType: 'Retailer',
          address: marketplaceUser.chosenAddress || '',
          status: 'Active',
          userId: distributorUserId,
        }
      });
      
      // Compute group totals from items for this distributor
      const groupSubtotal = itemsForDistributor.reduce((sum: number, it: OrderItemInput) => sum + parseFloat(String(it.subtotal || 0)), 0);
      const groupTotalOrders = itemsForDistributor.reduce((sum: number, it: OrderItemInput) => sum + parseInt(String(it.packageQuantity || 1)), 0);
      // Evenly distribute shipping and discounts across groups
      const groupsCount = distributorToItems.size;
      const groupShipping = parseFloat(String(shippingFee || 0)) / groupsCount;
      const groupDiscounts = parseFloat(String(discounts || 0)) / groupsCount;
      const groupTotalAmount = groupSubtotal + groupShipping - groupDiscounts;
      
      const groupOrderId = distributorToItems.size > 1 ? `${String(orderId)}-${groupIndex}` : String(orderId);
      const orderData = {
        orderId: groupOrderId,
        buyerId: buyerPerDistributorId,
        buyerIdSnapshot: buyerPerDistributorId,
        orderDate: new Date(orderDate || new Date()),
        orderDateSnapshot: new Date(orderDate || new Date()),
        orderStatus: String(orderStatus || 'Pending'),
        paymentStatus: String(paymentStatus || 'Unpaid'),
        deliveryMethod: String(deliveryMethod || 'Distributor Fleet'),
        deliveryOption: normalizedDeliveryOption,
        subtotal: groupSubtotal,
        discounts: groupDiscounts,
        shippingFee: groupShipping,
        totalAmount: groupTotalAmount,
        paymentTerms: String(paymentTerms || 'Cash on Delivery'),
        totalOrders: groupTotalOrders,
        contactPerson: String(contactPerson || marketplaceUser.name || ''),
        contactPersonSnapshot: String(contactPerson || marketplaceUser.name || ''),
        storeName: String(storeName || marketplaceUser.storeName || ''),
        storeNameSnapshot: String(storeName || marketplaceUser.storeName || ''),
        contactPhone: String(contactPhone || marketplaceUser.phone || ''),
        contactPhoneSnapshot: String(contactPhone || marketplaceUser.phone || ''),
        customerEmail: customerEmail ? String(customerEmail) : (marketplaceUser.email || ''),
        customerEmailSnapshot: customerEmail ? String(customerEmail) : (marketplaceUser.email || ''),
        deliveryAddress: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
        deliveryAddressSnapshot: String(deliveryAddress || marketplaceUser.chosenAddress || ''),
        preferredDeliveryDate: normalizedPreferredDeliveryDate,
        preferredDeliveryTime: normalizedPreferredDeliveryTime,
        preferredPickupDate: normalizedPreferredPickupDate,
        preferredPickupTime: normalizedPreferredPickupTime,
        shippingMethodLabel: normalizedShippingLabel,
        shippingMethod: normalizedShippingMethod,
        userId: distributorUserId
      };
      const order = await prisma.order.create({ data: orderData });
      createdOrders.push({ orderId: order.orderId });
      
      // Create order items for this distributor only
      if (itemsForDistributor.length > 0) {
        const usedOfferIds: string[] = [];
        await prisma.$transaction(async (tx) => {
          const orderItemPromises = itemsForDistributor.map(async (item: OrderItemInput) => {
            const product = await tx.product.findFirst({
              where: { productId: String(item.productId || '') },
              include: { variants: true, variantOptions: true }
            });
            if (!product) throw new Error(`Product not found: ${item.productId}`);
            const variantOption = item.variantId ? (product.variantOptions?.find(vo => vo.id === item.variantId) || product.variantOptions?.[0]) : product.variantOptions?.[0];
            if (!variantOption) throw new Error(`No variant options found for product: ${item.productId}.`);
            const packageQuantity = parseInt(String(item.packageQuantity || 1));
            const piecesPerPackage = parseInt(String(item.piecesPerPackage || 1));
            const totalQuantity = packageQuantity * piecesPerPackage;
            const orderTotal = groupTotalAmount;
            const offerValidation = await validateOfferForProduct(
              product.productId,
              userIdNum,
              orderTotal,
              totalQuantity,
              tx,
              packageQuantity,
              variantOption
            );
            let orderItemData = {
              orderId: order.orderId,
              productId: String(item.productId || ''),
              subtotal: parseFloat(String(item.subtotal || 0)),
              packageType: String(item.packageType || 'Box'),
              piecesPerPackage: piecesPerPackage,
              packageQuantity: packageQuantity,
              pricePerPackage: parseFloat(String(item.pricePerPackage || 0)),
              productNameSnapshot: String(item.productName || 'Unknown Product'),
              productSkuSnapshot: String(item.productSku || ''),
              productTypeSnapshot: String(item.category || 'Uncategorized'),
              variantNameSnapshot: String(item.variantName || 'Default'),
              offerApplied: false,
              offerBadgeSnapshot: null as string | null,
              offerNameSnapshot: null as string | null,
              originalPriceSnapshot: null as string | null,
              discountPercentage: null as number | null,
              discountAmount: null as number | null,
              promotionDetailsSnapshot: null as string | null,
              moqSnapshot: variantOption.moq || null
            };
            if (offerValidation.isValid && offerValidation.offerId) {
              if (!usedOfferIds.includes(offerValidation.offerId)) usedOfferIds.push(offerValidation.offerId);
              if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
                await trackOfferUsageForAllTypes(offerValidation.offerId, offerValidation.applicableDiscountTypes, userIdNum, tx);
              } else if (offerValidation.discountTypeId) {
                await trackOfferUsageUtil(offerValidation.offerId, offerValidation.discountTypeId, userIdNum, offerValidation.discountAmount || 0, tx);
              }
              orderItemData = {
                ...orderItemData,
                offerApplied: true,
                offerBadgeSnapshot: offerValidation.offerBadge || null,
                offerNameSnapshot: offerValidation.offerName || null,
                originalPriceSnapshot: offerValidation.originalPrice?.toString() || null,
                discountPercentage: offerValidation.discountPercentage || null,
                discountAmount: offerValidation.discountAmount || null,
                promotionDetailsSnapshot: offerValidation.promotionDetails ? JSON.stringify(offerValidation.promotionDetails) : null
              };
            }
            return tx.orderItem.create({ data: orderItemData });
          });
          await Promise.all(orderItemPromises);
        });
        if (usedOfferIds.length > 0) {
          await updateOfferStatusesBasedOnLimits(usedOfferIds);
        }
      }
      
      // Sync the order to the buyer profile for this distributor
      try {
        await syncOrderToBuyerProfile((await prisma.order.findUnique({ where: { orderId: order.orderId } }))!.buyerId!, distributorUserId);
      } catch {}
    }
    
    // Validate stock availability BEFORE creating order
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      for (const item of orderItems) {
        // Get the variant option first to calculate total pieces for MOQ validation
        const product = await prisma.product.findFirst({
          where: { productId: String(item.productId || '') },
          include: { 
            variants: true, // ProductVariant definitions
            variantOptions: true // VariantOption combinations
          }
        });
        
        if (!product) {
          return NextResponse.json(
            { error: `Product not found: ${item.productId}` },
            { status: 404, headers }
          );
        }
        
        // Use variantOptions for actual pricing/stock data
        const variantOption = product.variantOptions?.find(vo => vo.id === item.variantId) || product.variantOptions?.[0];
        if (!variantOption) {
          return NextResponse.json(
            { error: `No variant options found for product: ${item.productId}` },
            { status: 404, headers }
          );
        }
        const packageQuantity = item.packageQuantity || 1;
        // Get piecesPerPackage from item (piece-based system)
        const piecesPerPackage = item.piecesPerPackage || 1;
        const totalPieces = packageQuantity * piecesPerPackage;
        
        // Use the new variant validation service with correct quantities for MOQ validation
        const variantValidation = await validateVariant(String(item.productId || ''), item.variantId, totalPieces, packageQuantity);
        
        if (!variantValidation.isValid) {
          return NextResponse.json(
            { error: variantValidation.error },
            { status: 404, headers }
          );
        }
        
        // Calculate total quantity needed (including promotion free items)
        const orderedQty = parseInt(String(item.packageQuantity || 1));
        let totalQtyNeeded = orderedQty;
        
        // Check if product has Buy X Get Y promotion
        const productOffers = await prisma.offer.findMany({
          where: {
            userId: product.userId || undefined,
            status: 'active',
            offerProducts: {
              some: {
                productId: product.productId
              }
            }
          },
          include: {
            offerDiscountTypes: {
              where: { isActive: true, discountType: 'buy_x_get_y' }
            }
          }
        });
        
        if (productOffers.length > 0) {
          const buyXGetYPromo = productOffers[0].offerDiscountTypes.find(
            (dt) => dt.discountType === 'buy_x_get_y'
          );
          
          if (buyXGetYPromo) {
            const minQty = buyXGetYPromo.minQuantity || 1;
            const freeQty = buyXGetYPromo.discountValue || 0;
            
            // Calculate how many free items they get
            const qualifyingSets = Math.floor(orderedQty / minQty);
            const totalFreeItems = qualifyingSets * freeQty;
            totalQtyNeeded = orderedQty + totalFreeItems;
          }
        }
        
        // Check variant-level stock (piece-based system)
        if (variantOption.stockQuantity < totalQtyNeeded) {
          const variantName = variantOption.attributes 
            ? Object.entries(variantOption.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')
            : 'Default';
          
          return NextResponse.json(
            { 
              error: `Insufficient stock for ${product.name} (${variantName}). Available: ${variantOption.stockQuantity}, Required: ${totalQtyNeeded} (including ${totalQtyNeeded - orderedQty} free items)` 
            },
            { status: 400, headers }
          );
        }
      }
    }
    
    
    // Return created orders (one per distributor). Keep legacy 'order' pointing to first for backward compatibility
    const createdOrdersFull = await prisma.order.findMany({
      where: { orderId: { in: createdOrders.map(o => o.orderId) } },
      include: { orderItemsRel: { include: { product: true } } }
    });
    return NextResponse.json({
      success: true,
      orders: createdOrdersFull,
      order: createdOrdersFull[0]
    }, { 
      status: 201, 
      headers: {
        ...headers,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      }
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create order', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers }
    );
  }
}

