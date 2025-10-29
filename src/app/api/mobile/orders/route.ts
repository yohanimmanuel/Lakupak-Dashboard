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
import { syncOrderToBuyerProfile } from '../../../../utils/buyerSync';
// Inline function to avoid circular imports
// Price updates are now handled by the offers API - no longer needed here

interface OfferDiscountType {
  id: string;
  discountType: string;
  discountValue: number;
  minQuantity: number | null;
  freeQuantity: number | null;
  isActive: boolean;
  description: string | null;
}

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
    const marketplaceBuyerId = `LKB-${marketplaceUser.id.toString().padStart(8, '0')}`;
    
    const orders = await prisma.order.findMany({
      where: {
        buyerId: marketplaceBuyerId
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
        buyerId: marketplaceBuyerId
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
    const body = await request.json();
    
    const { 
      orderId, 
      buyerId, 
      orderDate, 
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
      orderStatus, 
      paymentStatus, 
      paymentTerms, 
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
    
    if (!marketplaceUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers }
      );
    }
    
    // Get distributor userId from the products
    let distributorUserId = null;
    let allDistributors = new Set();
    
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      // Get all product IDs to check their distributors
      const productIds = orderItems.map(item => String(item.productId));
      const products = await prisma.product.findMany({
        where: { productId: { in: productIds } },
        select: { userId: true }
      });
      
      // Collect all unique distributor IDs
      products.forEach(product => {
        if (product.userId) {
          allDistributors.add(product.userId);
        }
      });
      
      // For now, use the first distributor found
      // TODO: In the future, we might need to create separate orders for each distributor
      distributorUserId = products[0]?.userId;
    }
    
    // Validate that we found a distributor
    if (!distributorUserId) {
      return NextResponse.json(
        { error: 'Unable to determine distributor for products' },
        { status: 400, headers }
      );
    }
    
    // Create or find buyer record for mobile marketplace user
    const mobileBuyerId = `LKB-${marketplaceUser.id.toString().padStart(8, '0')}`;
    
    // Check if buyer already exists
    let buyer = await prisma.buyer.findUnique({
      where: { buyerId: mobileBuyerId }
    });
    
    // Create buyer if it doesn't exist
    if (!buyer) {
      buyer = await prisma.buyer.create({
        data: {
          buyerId: mobileBuyerId,
          owner: marketplaceUser.name || 'Mobile User',
          email: marketplaceUser.email || '',
          phone: marketplaceUser.phone || '',
          storeName: marketplaceUser.storeName || 'Mobile Store',
          businessType: 'Retailer',
          address: marketplaceUser.chosenAddress || '',
          status: 'Active',
          userId: distributorUserId // Associate with the distributor
        }
      });
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
    
    // For mobile orders, we'll create them in the main Order table
    // and link them to the buyer record for proper data collection
    const orderData = {
      orderId: String(orderId),
      buyerId: mobileBuyerId,
      buyerIdSnapshot: mobileBuyerId,
      orderDate: new Date(orderDate || new Date()),
      orderDateSnapshot: new Date(orderDate || new Date()),
      orderStatus: String(orderStatus || 'Pending'),
      paymentStatus: String(paymentStatus || 'Unpaid'),
      deliveryMethod: String(deliveryMethod || 'Distributor Fleet'),
      subtotal: parseFloat(String(subtotal || 0)),
      discounts: parseFloat(String(discounts || 0)),
      shippingFee: parseFloat(String(shippingFee || 0)),
      totalAmount: parseFloat(String(totalAmount || 0)),
      paymentTerms: String(paymentTerms || 'Cash on Delivery'),
      totalOrders: parseInt(String(totalOrders || 1)),
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
      userId: distributorUserId // Associate with the distributor who owns the product
    };
    const order = await prisma.order.create({
      data: orderData,
      include: {
        orderItemsRel: true
      }
    });
    
    // Create order items if provided with offer validation and tracking
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      // Track used offer IDs for targeted deactivation
      const usedOfferIds: string[] = [];
      
      await prisma.$transaction(async (tx) => {
        
        const orderItemPromises = orderItems.map(async (item: OrderItemInput) => {
          // Fetch product with variant options
          const product = await tx.product.findFirst({
            where: { productId: String(item.productId || '') },
            include: { 
              variants: true, // ProductVariant definitions
              variantOptions: true // VariantOption combinations
            }
          });
          
          if (!product) {
            throw new Error(`Product not found: ${item.productId}`);
          }
          
          // Get the specific variant option (use first or find by variantId if provided)
          const variantOption = item.variantId ? 
            product.variantOptions?.find(vo => vo.id === item.variantId) || product.variantOptions?.[0] :
            product.variantOptions?.[0];
          
          if (!variantOption) {
            throw new Error(`No variant options found for product: ${item.productId}.`);
          }
          
          // Calculate total amount and quantity for validation
          const packageQuantity = parseInt(String(item.packageQuantity || 1));
          const piecesPerPackage = parseInt(String(item.piecesPerPackage || 1));
          const totalQuantity = packageQuantity * piecesPerPackage;
          const orderTotal = parseFloat(String(totalAmount || 0));
          
          // Validate and get offer information with usage limits check
          const offerValidation = await validateOfferForProduct(
            product.productId,
            userIdNum, // marketplace user ID
            orderTotal,
            totalQuantity,
            tx,
            packageQuantity, // Pass package quantity for buy_x_get_y calculations
            variantOption // Pass variant option for accurate pricing
          );
          
          // Initialize order item data
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
            moqSnapshot: variantOption.moq || null // Save MOQ at time of order (in pieces)
          };
          
          // If offer is valid, track usage and add snapshot data
          if (offerValidation.isValid && offerValidation.offerId) {
            // Add to used offer IDs for targeted deactivation
            if (!usedOfferIds.includes(offerValidation.offerId)) {
              usedOfferIds.push(offerValidation.offerId);
            }
            
            // Track usage for all applicable discount types
            if (offerValidation.applicableDiscountTypes && offerValidation.applicableDiscountTypes.length > 0) {
              await trackOfferUsageForAllTypes(
                offerValidation.offerId,
                offerValidation.applicableDiscountTypes,
                userIdNum,
                tx
              );
            } else if (offerValidation.discountTypeId) {
              // Fallback to single discount type tracking for backward compatibility
              await trackOfferUsageUtil(
                offerValidation.offerId,
                offerValidation.discountTypeId,
                userIdNum,
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
    }
    
    // Return the created order with items
    const createdOrder = await prisma.order.findUnique({
      where: { orderId: order.orderId },
      include: {
        orderItemsRel: {
          include: {
            product: true
          }
        }
      }
    });
    
    // Auto-sync order to buyer profile if buyerId exists
    if (createdOrder?.buyerId && distributorUserId) {
      try {
        await syncOrderToBuyerProfile(createdOrder.buyerId, distributorUserId);
      } catch (syncError) {
        // Log error but don't fail the order creation
      }
    }

    return NextResponse.json({
      success: true,
      order: createdOrder
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

