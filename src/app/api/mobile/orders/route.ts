import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../../generated/prisma';
import { 
  getSecurityHeaders, 
  validateAuthInput 
} from '../../../../utils/auth-security';

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
        // Offer snapshots from time of purchase
        offerApplied: oi.offerApplied || false,
        offerBadgeSnapshot: oi.offerBadgeSnapshot || null,
        offerNameSnapshot: oi.offerNameSnapshot || null,
        originalPriceSnapshot: oi.originalPriceSnapshot || null,
        discountPercentage: oi.discountPercentage || null,
        promotionDetailsSnapshot: oi.promotionDetailsSnapshot || null
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
        const product = await prisma.product.findFirst({
          where: { productId: String(item.productId || '') }
        });
        
        if (!product) {
          return NextResponse.json(
            { error: `Product not found: ${item.productId}` },
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
        
        // Check if sufficient stock
        if (product.stockQuantity < totalQtyNeeded) {
          return NextResponse.json(
            { 
              error: `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Required: ${totalQtyNeeded} (including ${totalQtyNeeded - orderedQty} free items)` 
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
    
    // Create order items if provided
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      const orderItemPromises = orderItems.map(async (item: OrderItemInput) => {
        // Fetch product to get offer information
        const product = await prisma.product.findFirst({
          where: { productId: String(item.productId || '') }
        });
        
        // Fetch active offers for this product
        let offerApplied = false;
        let offerBadgeSnapshot = null;
        let offerNameSnapshot = null;
        let originalPriceSnapshot = null;
        let discountPercentage = null;
        let promotionDetailsSnapshot = null;
        
        if (product) {
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
                where: { isActive: true }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          });
          
          if (productOffers.length > 0) {
            const primaryOffer = productOffers[0];
            const activeDiscountTypes = primaryOffer.offerDiscountTypes.filter((dt) => dt.isActive !== false);
            
            const hasDiscount = activeDiscountTypes.some((dt) => 
              dt.discountType === 'percentage' || dt.discountType === 'fixed'
            );
            const hasPromotion = activeDiscountTypes.some((dt) => 
              dt.discountType === 'buy_x_get_y'
            );
            
            let offerBadge = 'Offer';
            if (hasDiscount && hasPromotion) {
              offerBadge = 'All Offers';
            } else if (hasPromotion) {
              offerBadge = 'Promotion';
            } else if (hasDiscount) {
              offerBadge = 'Discount';
            }
            
            offerApplied = true;
            offerBadgeSnapshot = offerBadge;
            offerNameSnapshot = primaryOffer.name;
            originalPriceSnapshot = product.originalSellingPrice;
            
            // Calculate discount percentage
            if (offerBadge !== 'Promotion' && product.originalSellingPrice && product.sellingPrice) {
              const originalPrice = typeof product.originalSellingPrice === 'string' 
                ? parseInt(product.originalSellingPrice.replace(/[^\d]/g, '')) || 0
                : product.originalSellingPrice;
              const currentPrice = typeof product.sellingPrice === 'string'
                ? parseInt(product.sellingPrice.replace(/[^\d]/g, '')) || 0
                : product.sellingPrice;
              if (originalPrice > 0 && currentPrice > 0 && currentPrice < originalPrice) {
                discountPercentage = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
              }
            }
            
            // Get Buy X Get Y promotion details
            const buyXGetYPromo = activeDiscountTypes.find((dt) => dt.discountType === 'buy_x_get_y');
            if (buyXGetYPromo) {
              promotionDetailsSnapshot = JSON.stringify({
                minQuantity: buyXGetYPromo.minQuantity,
                freeQuantity: buyXGetYPromo.discountValue,
                description: buyXGetYPromo.description || `Buy ${buyXGetYPromo.minQuantity} Get ${buyXGetYPromo.discountValue} Free`
              });
            }
          }
        }
        
        return prisma.orderItem.create({
          data: {
            orderId: order.orderId,
            productId: String(item.productId || ''),
            subtotal: parseFloat(String(item.subtotal || 0)),
            packageType: String(item.packageType || 'Box'),
            piecesPerPackage: parseInt(String(item.piecesPerPackage || 1)),
            packageQuantity: parseInt(String(item.packageQuantity || 1)),
            pricePerPackage: parseFloat(String(item.pricePerPackage || 0)),
            productNameSnapshot: String(item.productName || 'Unknown Product'),
            productSkuSnapshot: String(item.productSku || ''),
            productTypeSnapshot: String(item.category || 'Uncategorized'),
            // Offer snapshots
            offerApplied,
            offerBadgeSnapshot,
            offerNameSnapshot,
            originalPriceSnapshot,
            discountPercentage,
            promotionDetailsSnapshot
          }
        });
      });
      
      await Promise.all(orderItemPromises);
      
      // Track offer usage and discount given
      await trackOfferUsage(orderItems, distributorUserId, mobileBuyerId, userIdNum);
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

// Helper function to track offer usage and discount given
async function trackOfferUsage(
  orderItems: Array<{
    productId: string;
    quantity?: number;
    subtotal: number;
    packageQuantity?: number;
    piecesPerPackage?: number;
  }>, 
  distributorUserId: number | null,
  buyerId?: string,
  marketplaceUserId?: number
) {
  if (!distributorUserId) return;
  
  try {
    // Get all products from the order
    const productIds = orderItems.map(item => String(item.productId));
    
    // Find products with active offers
    const products = await prisma.product.findMany({
      where: {
        productId: { in: productIds },
        userId: distributorUserId
      },
      select: {
        productId: true,
        sellingPrice: true,
        originalSellingPrice: true
      }
    });
    
    // Get active offers for these products
    const activeOffers = await prisma.offer.findMany({
      where: {
        userId: distributorUserId,
        status: 'active',
        offerProducts: {
          some: {
            productId: { in: productIds }
          }
        }
      },
      include: {
        offerDiscountTypes: {
          where: { isActive: true }
        },
        offerProducts: true
      }
    });
    
    // Track usage and discount for each offer
    for (const offer of activeOffers) {
      const activeDiscountTypes = offer.offerDiscountTypes.filter(dt => dt.isActive);
      let totalDiscountForOffer = 0;
      let usageCount = 0;
      let hasValidDiscountType = false;
      
      // Process each discount type separately
      for (const discountType of activeDiscountTypes) {
        // Check perCustomerLimit for this specific discount type
        let canUseDiscountType = true;
        
        if ((buyerId || marketplaceUserId) && discountType.perCustomerLimit && discountType.perCustomerLimit > 0) {
          // Check existing usage for this customer and this specific discount type
          let existingUsage = null;
          if (buyerId) {
            existingUsage = await prisma.offerUsageTracking.findUnique({
              where: { 
                offerId_discountTypeId_buyerId: { 
                  offerId: offer.id, 
                  discountTypeId: discountType.id,
                  buyerId: buyerId 
                } 
              }
            });
          } else if (marketplaceUserId) {
            existingUsage = await prisma.offerUsageTracking.findUnique({
              where: { 
                offerId_discountTypeId_marketplaceUserId: { 
                  offerId: offer.id, 
                  discountTypeId: discountType.id,
                  marketplaceUserId: marketplaceUserId 
                } 
              }
            });
          }
          
          if (existingUsage && existingUsage.usageCount >= discountType.perCustomerLimit) {
            // Customer has reached their limit for this discount type
            console.log(`Customer ${buyerId || marketplaceUserId} has reached perCustomerLimit (${discountType.perCustomerLimit}) for discount type ${discountType.discountType} in offer ${offer.id}`);
            canUseDiscountType = false;
          }
        }
        
        if (canUseDiscountType) {
          hasValidDiscountType = true;
          
          // Calculate discount for this specific discount type
          for (const orderItem of orderItems) {
            const product = products.find(p => p.productId === String(orderItem.productId));
            if (!product) continue;
            
            // Check if this product is part of the offer
            const isInOffer = offer.offerProducts.some(op => op.productId === product.productId);
            if (!isInOffer) continue;
            
            // Calculate discount based on discount type
            if (discountType.discountType === 'percentage' || discountType.discountType === 'fixed') {
              if (product.originalSellingPrice) {
                const originalPrice = typeof product.originalSellingPrice === 'string'
                  ? parseInt(product.originalSellingPrice.replace(/[^\d]/g, '')) || 0
                  : product.originalSellingPrice;
                
                const currentPrice = typeof product.sellingPrice === 'string'
                  ? parseInt(product.sellingPrice.replace(/[^\d]/g, '')) || 0
                  : product.sellingPrice;
                
                if (originalPrice > currentPrice) {
                  const discountPerUnit = originalPrice - currentPrice;
                  const packageQuantity = orderItem.packageQuantity || 1;
                  const piecesPerPackage = orderItem.piecesPerPackage || 1;
                  const totalQuantity = packageQuantity * piecesPerPackage;
                  
                  totalDiscountForOffer += discountPerUnit * totalQuantity;
                  usageCount += 1;
                }
              }
            } else if (discountType.discountType === 'buy_x_get_y') {
              // For buy X get Y, we count the usage but don't calculate monetary discount
              const packageQuantity = orderItem.packageQuantity || 1;
              const piecesPerPackage = orderItem.piecesPerPackage || 1;
              const totalQuantity = packageQuantity * piecesPerPackage;
              
              // Check if customer qualifies for the promotion
              const minQuantity = discountType.minQuantity || 1;
              if (totalQuantity >= minQuantity) {
                usageCount += 1;
                // Note: For buy X get Y, the discount is in free items, not monetary value
                // We could track this separately if needed
              }
            }
          }
        }
      }
      
      // Only update offer statistics if at least one discount type was valid
      if (hasValidDiscountType && usageCount > 0) {
        const updatedOffer = await prisma.offer.update({
          where: { id: offer.id },
          data: {
            totalUsage: { increment: usageCount },
            totalDiscountGiven: { increment: totalDiscountForOffer }
          }
        });
        
        // Track per-customer usage for each discount type that was used
        for (const discountType of activeDiscountTypes) {
          // Check if this discount type was actually used (simplified check)
          let canUseDiscountType = true;
          if ((buyerId || marketplaceUserId) && discountType.perCustomerLimit && discountType.perCustomerLimit > 0) {
            let existingUsage = null;
            if (buyerId) {
              existingUsage = await prisma.offerUsageTracking.findUnique({
                where: { 
                  offerId_discountTypeId_buyerId: { 
                    offerId: offer.id, 
                    discountTypeId: discountType.id,
                    buyerId: buyerId 
                  } 
                }
              });
            } else if (marketplaceUserId) {
              existingUsage = await prisma.offerUsageTracking.findUnique({
                where: { 
                  offerId_discountTypeId_marketplaceUserId: { 
                    offerId: offer.id, 
                    discountTypeId: discountType.id,
                    marketplaceUserId: marketplaceUserId 
                  } 
                }
              });
            }
            
            if (existingUsage && existingUsage.usageCount >= discountType.perCustomerLimit) {
              canUseDiscountType = false;
            }
          }
          
          if (canUseDiscountType) {
            if (buyerId) {
              await prisma.offerUsageTracking.upsert({
                where: { 
                  offerId_discountTypeId_buyerId: { 
                    offerId: offer.id, 
                    discountTypeId: discountType.id,
                    buyerId: buyerId 
                  } 
                },
                update: {
                  usageCount: { increment: 1 },
                  lastUsedAt: new Date()
                },
                create: {
                  offerId: offer.id,
                  discountTypeId: discountType.id,
                  buyerId: buyerId,
                  usageCount: 1,
                  lastUsedAt: new Date()
                }
              });
            } else if (marketplaceUserId) {
              await prisma.offerUsageTracking.upsert({
                where: { 
                  offerId_discountTypeId_marketplaceUserId: { 
                    offerId: offer.id, 
                    discountTypeId: discountType.id,
                    marketplaceUserId: marketplaceUserId 
                  } 
                },
                update: {
                  usageCount: { increment: 1 },
                  lastUsedAt: new Date()
                },
                create: {
                  offerId: offer.id,
                  discountTypeId: discountType.id,
                  marketplaceUserId: marketplaceUserId,
                  usageCount: 1,
                  lastUsedAt: new Date()
                }
              });
            }
          }
        }
        
        // Check if maxUsage is reached and deactivate offer automatically
        for (const discountType of activeDiscountTypes) {
          if (discountType.maxUsage && discountType.maxUsage > 0) {
            if (updatedOffer.totalUsage >= discountType.maxUsage) {
              // Deactivate the offer
              await prisma.offer.update({
                where: { id: offer.id },
                data: { status: 'inactive' }
              });
              console.log(`Offer ${offer.id} (${offer.name}) deactivated - maxUsage reached: ${updatedOffer.totalUsage}/${discountType.maxUsage}`);
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    // Silently fail - don't break order creation if tracking fails
    console.error('Failed to track offer usage:', error);
  }
}
