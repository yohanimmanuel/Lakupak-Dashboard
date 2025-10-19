import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '../../../generated/prisma';
import { getProductSecurityHeaders } from '../../../utils/product-security';

interface OfferDiscountType {
  id: string;
  discountType: string;
  discountValue: number;
  minQuantity: number | null;
  freeQuantity?: number | null;
  isActive: boolean;
  description: string | null;
}

interface OfferProduct {
  productId: string;
}

interface ActiveOffer {
  id: string;
  offerDiscountTypes: OfferDiscountType[];
  offerProducts: OfferProduct[];
}

const prisma = new PrismaClient();

// GET /api/marketplace - Get published products for marketplace
export async function GET(request: NextRequest) {
  const headers = getProductSecurityHeaders();
  
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const marketplaceUserId = searchParams.get('marketplaceUserId');
    
    // Build where clause for published products only
    const whereClause: Record<string, unknown> = {
      marketplaceStatus: 'Published',
      status: 'Published'
    };
    
    // Build OR conditions for filtering
    const orConditions: Record<string, unknown>[] = [];
    
    if (category && category !== 'All') {
      orConditions.push({ productType: category });
    }
    
    if (search) {
      orConditions.push(
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { productType: { contains: search, mode: 'insensitive' } },
      );
    }
    
    if (orConditions.length > 0) {
      whereClause.OR = orConditions;
    }
    
    const skip = (page - 1) * limit;
    
    // Get published products with user info, ordered by lastSyncAt to get most recent changes
    const products = await prisma.product.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            company: {
              select: {
                name: true,
                businessAddress: true,
                businessPhone: true,
                businessEmail: true,
                industryType: true,
                shippingPreferences: true,
                baseShippingPrice: true,
                expressShippingPrice: true,
                sameDayShippingPrice: true,
                nextDayShippingPrice: true,
                pickupAddress: true
              }
            }
          }
        }
      },
      skip,
      take: limit,
      orderBy: [
        { lastSyncAt: 'desc' }, // Prioritize recently synced products
        { publishedAt: 'desc' }  // Then by publish date
      ]
    });
    
    // Get active offers for all products
    const productIds = products.map(p => p.productId);
    const userIds = [...new Set(products.map(p => p.userId).filter((id): id is number => id !== null))];
    
    // Get only ACTIVE offers to check real-time status
    const allOffers = await prisma.offer.findMany({
      where: {
        userId: { in: userIds },
        status: 'active', // Only get active offers
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        offerProducts: {
          some: {
            productId: { in: productIds }
          }
        }
      },
      include: {
        offerProducts: true,
        offerDiscountTypes: true // Get ALL discount types, not just active ones
      }
    });

    // Filter offers - keep offer if at least one discount type is still usable
    const validOffers = [];
    for (const offer of allOffers) {
      let hasValidDiscountType = false;
      
      for (const discountType of offer.offerDiscountTypes) {
        let isDiscountTypeValid = true;
        
        // First check if the discount type is marked as active
        if (discountType.isActive !== true) {
          isDiscountTypeValid = false;
        }
        
        // Check max usage limit - this is the critical check
        if (isDiscountTypeValid && discountType.maxUsage && discountType.maxUsage > 0) {
          const totalUsage = await prisma.offerUsageTracking.aggregate({
            where: {
              offerId: offer.id,
              discountTypeId: discountType.id
            },
            _sum: {
              usageCount: true
            }
          });
          
          const currentUsage = totalUsage._sum.usageCount || 0;
          if (currentUsage >= discountType.maxUsage) {
            isDiscountTypeValid = false;
            // Immediately deactivate this discount type if limit is reached
            await prisma.offerDiscountType.update({
              where: { id: discountType.id },
              data: { isActive: false }
            });
          }
        }
        
        // If this discount type is valid, the offer is valid
        if (isDiscountTypeValid) {
          hasValidDiscountType = true;
          break;
        }
      }
      
      // If no valid discount types remain, deactivate the entire offer
      if (!hasValidDiscountType) {
        await prisma.offer.update({
          where: { id: offer.id },
          data: { status: 'inactive' }
        });
      } else {
        validOffers.push(offer);
      }
    }
    
    // Update product prices after deactivating offers to ensure prices revert immediately
    for (const userId of userIds) {
      await updateProductPricesFromOffers(prisma, userId);
    }
    
    // Create a map of product offers using only valid offers
    const productOffersMap = new Map();
    validOffers.forEach((offer) => {
      offer.offerProducts.forEach((op) => {
        if (!productOffersMap.has(op.productId)) {
          productOffersMap.set(op.productId, []);
        }
        productOffersMap.get(op.productId).push(offer);
      });
    });
    
    // Transform products for marketplace format
    const marketplaceProducts = await Promise.all(products.map(async (product) => {
      // Convert price strings to numbers, handling IDR format with dots as thousands separators
      let sellingPrice = typeof product.sellingPrice === 'string' 
        ? parseFloat(product.sellingPrice.replace(/[^\d.-]/g, '')) || 0
        : product.sellingPrice || 0;
      
      let purchasePrice = typeof product.purchasePrice === 'string'
        ? parseFloat(product.purchasePrice.replace(/[^\d.-]/g, '')) || 0
        : product.purchasePrice || 0;
      
      // Handle IDR format where dots are thousands separators (e.g., "550.000" = 550000)
      if (typeof product.sellingPrice === 'string' && product.sellingPrice.includes('.')) {
        // Remove dots and parse as integer (dots are thousands separators in IDR)
        sellingPrice = parseInt(product.sellingPrice.replace(/[^\d]/g, '')) || 0;
      }
      
      if (typeof product.purchasePrice === 'string' && product.purchasePrice.includes('.')) {
        // Remove dots and parse as integer (dots are thousands separators in IDR)
        purchasePrice = parseInt(product.purchasePrice.replace(/[^\d]/g, '')) || 0;
      }
      
      // Get original selling price (the price before any discounts)
      let originalSellingPriceValue = product.originalSellingPrice ? 
        (typeof product.originalSellingPrice === 'string' 
          ? parseInt(product.originalSellingPrice.replace(/[^\d]/g, '')) || 0
          : product.originalSellingPrice) 
        : sellingPrice; // Fallback to current selling price if no original price
      
      // If originalSellingPrice exists and is different from sellingPrice, 
      // it means there's an active discount applied by the main system
      const hasActiveDiscountInMainSystem = product.originalSellingPrice && 
        parseInt(product.originalSellingPrice.replace(/[^\d]/g, '')) !== sellingPrice;
      
      // Check if product has active offers
      const productOffers = productOffersMap.get(product.productId) || [];
      let offerBadge = undefined;
      let hasActiveOffer = false;
      let offerId = undefined;
      let offerName = undefined;
      let originalSellingPrice = undefined;
      let discountType = undefined;
      let discountValue = undefined;
      let hasPriceDiscounts = false;
      
      let promotionDetails = undefined;
      
      if (productOffers.length > 0) {
        const primaryOffer = productOffers[0];
        
        // Filter to only ACTIVE discount types that haven't reached usage limits
        const activeDiscountTypes = [];
        for (const dt of primaryOffer.offerDiscountTypes) {
          let isDiscountTypeUsable = true;
          
          // First check if the discount type is marked as active
          if (dt.isActive !== true) {
            isDiscountTypeUsable = false;
          }
          
          // Check if this discount type has reached its usage limit
          if (isDiscountTypeUsable && dt.maxUsage && dt.maxUsage > 0) {
            const totalUsage = await prisma.offerUsageTracking.aggregate({
              where: {
                offerId: primaryOffer.id,
                discountTypeId: dt.id
              },
              _sum: {
                usageCount: true
              }
            });
            
            const currentUsage = totalUsage._sum.usageCount || 0;
            if (currentUsage >= dt.maxUsage) {
              isDiscountTypeUsable = false;
              // Immediately deactivate this discount type if limit is reached
              await prisma.offerDiscountType.update({
                where: { id: dt.id },
                data: { isActive: false }
              });
            }
          }
          
          if (isDiscountTypeUsable) {
            activeDiscountTypes.push(dt);
          }
        }
        
        // If no active discount types remain, deactivate the entire offer
        if (activeDiscountTypes.length === 0) {
          await prisma.offer.update({
            where: { id: primaryOffer.id },
            data: { status: 'inactive' }
          });
        }
        
        // Check if all offer types have reached their maximum usage (same logic as OfferTable)
        const typesWithLimits = activeDiscountTypes.filter(dt => dt.maxUsage && dt.maxUsage > 0);
        
        // Get individual usage tracking for each discount type
        const usageMap = new Map();
        for (const dt of typesWithLimits) {
          const usage = await prisma.offerUsageTracking.aggregate({
            where: {
              offerId: primaryOffer.id,
              discountTypeId: dt.id
            },
            _sum: {
              usageCount: true
            }
          });
          usageMap.set(dt.id, usage._sum.usageCount || 0);
        }
        
        const allLimitsReached = typesWithLimits.length > 0 && typesWithLimits.every(dt => (usageMap.get(dt.id) || 0) >= (dt.maxUsage || 0));
        
        // If all limits are reached, don't show the offer
        if (allLimitsReached) {
          hasActiveOffer = false;
          offerBadge = undefined;
          offerId = undefined;
          offerName = undefined;
          discountType = undefined;
          discountValue = undefined;
          promotionDetails = undefined;
          originalSellingPrice = undefined;
        } else {
          // Show offer details if there are actually usable discount types
          // For price discounts, also check if main system shows active discount
          // For promotions (buy_x_get_y), show them regardless of main system discount status
          hasPriceDiscounts = activeDiscountTypes.some((dt: OfferDiscountType) => 
            dt.discountType === 'percentage' || dt.discountType === 'fixed'
          );
          const hasPromotions = activeDiscountTypes.some((dt: OfferDiscountType) => 
            dt.discountType === 'buy_x_get_y'
          );
          
          const shouldShowOffer = activeDiscountTypes.length > 0 && (
            (hasPriceDiscounts && hasActiveDiscountInMainSystem) || 
            (hasPromotions && !hasPriceDiscounts) ||
            (hasPriceDiscounts && hasPromotions)
          );
        
          if (shouldShowOffer) {
          if (hasPriceDiscounts && hasPromotions) {
            offerBadge = 'All Offers';
          } else if (hasPromotions) {
            offerBadge = 'Promotion';
          } else if (hasPriceDiscounts) {
            offerBadge = 'Discount';
          } else {
            offerBadge = 'Offer';
          }
          
          // Get discount type and value (only for price discounts)
          if (hasPriceDiscounts) {
            const fixedDiscount = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'fixed');
            const percentageDiscount = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'percentage');
            discountType = fixedDiscount ? 'fixed' : (percentageDiscount ? 'percentage' : undefined);
            discountValue = fixedDiscount ? fixedDiscount.discountValue : (percentageDiscount ? percentageDiscount.discountValue : undefined);
          }
          
          // Get Buy X Get Y promotion details
          const buyXGetYPromo = activeDiscountTypes.find((dt: OfferDiscountType) => dt.discountType === 'buy_x_get_y');
          if (buyXGetYPromo) {
            promotionDetails = {
              minQuantity: buyXGetYPromo.minQuantity,
              freeQuantity: buyXGetYPromo.discountValue,
              description: buyXGetYPromo.description || `Buy ${buyXGetYPromo.minQuantity} Get ${buyXGetYPromo.discountValue} Free`
            };
          }
          
            hasActiveOffer = true;
            offerId = primaryOffer.id;
            offerName = primaryOffer.name;
            // Only show original price if there are active price discounts
            originalSellingPrice = hasPriceDiscounts ? originalSellingPriceValue : undefined;
          } else {
            // No usable discount types OR main system doesn't show active discount - revert to normal pricing
            hasActiveOffer = false;
            offerBadge = undefined;
            offerId = undefined;
            offerName = undefined;
            discountType = undefined;
            discountValue = undefined;
            promotionDetails = undefined;
            originalSellingPrice = undefined;
          }
        }
      }
      
      return {
        id: product.productId,
        name: product.name,
        description: product.description,
        sellingPrice: hasActiveOffer && hasPriceDiscounts ? sellingPrice : originalSellingPriceValue,
        originalSellingPrice: hasActiveOffer && hasPriceDiscounts ? originalSellingPrice : undefined,
        // Keep old field names for backward compatibility
        price: hasActiveOffer && hasPriceDiscounts ? sellingPrice : originalSellingPriceValue,
        originalPrice: purchasePrice,
        // Offer integration
        offerBadge,
        hasActiveOffer,
        offerId,
        offerName,
        discountType: discountType,
        discountValue: discountValue,
        promotionDetails,
         rating: 0, // Will be calculated from actual reviews
         reviewCount: 0, // Will be calculated from actual reviews
         soldCount: "0", // Will be calculated from actual orders
        stock: product.stockQuantity,
        stockStatus: product.stockStatus || 'In Stock',
        images: product.images || [],
        category: product.productType || 'Uncategorized',
        brand: product.brand,
        unit: product.packageType || 'pcs',
        packageType: product.packageType || 'pcs',
        piecesPerPackage: product.piecesPerPackage || 1,
         seller: {
           name: product.user?.company?.name || 'Unknown Company',
           avatar: '/default-avatar.png',
           rating: 0, // Will be calculated from actual seller reviews
           reviewCount: 0, // Will be calculated from actual seller reviews
           isOfficial: true, // Keep this as true for now
           responseTime: 'N/A', // Will be calculated from actual response times
           deliverySpeed: 'N/A', // Will be calculated from actual delivery data
           returnPolicy: `${product.returnPolicyDays || 7} days return policy`,
           company: product.user?.company ? {
             name: product.user.company.name,
             businessAddress: product.user.company.businessAddress,
             businessPhone: product.user.company.businessPhone,
             businessEmail: product.user.company.businessEmail,
             industryType: product.user.company.industryType,
             pickupAddress: product.user.company.pickupAddress
           } : undefined
         },
         shipping: {
           preferences: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences) : [],
           standard: { 
             price: product.user?.company?.baseShippingPrice || 0, 
             free: false,
             available: true // Always available as base shipping option
           },
           express: { 
             price: product.user?.company?.expressShippingPrice || 0, 
             free: false,
             available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Express Shipping') : false
           },
           sameDay: { 
             price: product.user?.company?.sameDayShippingPrice || 0, 
             free: false,
             available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Same-day Delivery') : false
           },
           nextDay: { 
             price: product.user?.company?.nextDayShippingPrice || 0, 
             free: false,
             available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Next-day Delivery') : false
           },
           scheduled: {
             price: product.user?.company?.baseShippingPrice || 0,
             free: false,
             available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Scheduled Delivery') : false
           },
           pickup: {
             price: 0,
             free: true,
             available: product.user?.company?.shippingPreferences ? JSON.parse(product.user.company.shippingPreferences).includes('Pickup Available') : false
           }
         },
         shippingInfo: {
           location: 'Indonesia' // User region - country only for B2B
         },
        assurance: {
          halalCertified: product.halalCertified || false,
          bpomApproved: product.bpomApproved || false,
          returnPolicyDays: product.returnPolicyDays || 7,
          originalProduct: product.originalProduct !== false
        },
         reviews: {
           overallRating: 0,
           totalReviews: 0,
           breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
           sampleReview: null,
           hasReviews: false
         },
      // Additional fields for marketplace
      sku: product.sku,
      supplier: product.supplier,
      publishedAt: product.publishedAt,
      lastSyncAt: product.lastSyncAt
      };
    }));
    
    const totalCount = await prisma.product.count({ where: whereClause });
    
    return NextResponse.json({
      products: marketplaceProducts,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
      // Add timestamp to help with cache invalidation
      timestamp: new Date().toISOString()
    }, { 
      headers: {
        ...headers,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch marketplace products' },
      { status: 500, headers }
    );
  }
}

// POST /api/marketplace/publish - Publish product to marketplace
export async function POST(request: NextRequest) {
  const headers = getProductSecurityHeaders();
  
  try {
    const body = await request.json();
    const { productId, userId, action } = body; // action: 'publish' | 'unpublish'
    
    if (!productId || !userId || !action) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400, headers }
      );
    }
    
    // Validate product exists and belongs to user
    const userIdNum = Number(userId);
    if (isNaN(userIdNum)) {
      return NextResponse.json(
        { error: 'Invalid userId format' },
        { status: 400, headers }
      );
    }
    
    const product = await prisma.product.findFirst({
      where: {
        productId,
        userId: userIdNum
      }
    });
    
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404, headers }
      );
    }
    
    // Validate product is ready for publishing
    if (action === 'publish') {
      // Check if product has required fields for marketplace
      if (!product.name || !product.description || !product.sellingPrice) {
        return NextResponse.json(
          { error: 'Product must have name, description, and selling price' },
          { status: 400, headers }
        );
      }
      
      if (!product.images || product.images.length === 0) {
        return NextResponse.json(
          { error: 'Product must have at least one image' },
          { status: 400, headers }
        );
      }
    }
    
    // Update product marketplace status
    const updateData: Record<string, unknown> = {
      marketplaceStatus: action === 'publish' ? 'Published' : 'Unpublished',
      lastSyncAt: new Date()
    };
    
    if (action === 'publish') {
      updateData.publishedAt = new Date();
    }
    
    const updatedProduct = await prisma.product.update({
      where: { id: product.id },
      data: updateData
    });
    
    
    return NextResponse.json({
      success: true,
      product: updatedProduct,
      message: `Product ${action === 'publish' ? 'published to' : 'unpublished from'} marketplace successfully`
    }, { headers });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update marketplace status' },
      { status: 500, headers }
    );
  }
}

// Helper function to update product prices based on active offers
async function updateProductPricesFromOffers(tx: Prisma.TransactionClient, userId: number) {
  try {
    // Get all products for this user
    const allProducts = await tx.product.findMany({
      where: { userId: userId },
      select: {
        productId: true,
        sellingPrice: true,
        originalSellingPrice: true,
      },
    });

    // Get all offers for this user (both active and inactive to check discount types)
    const allOffers = await tx.offer.findMany({
      where: {
        userId: userId,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      include: {
        offerProducts: {
          include: {
            product: {
              select: {
                productId: true,
                sellingPrice: true,
                originalSellingPrice: true,
              },
            },
          },
        },
        offerDiscountTypes: true, // Get ALL discount types, not just active ones
      },
    });

    // Create a map of products with offers
    const productsWithOffers = new Map<string, { 
      productId: string;
      offerId: string; 
      offerBadge: string;
      originalPrice: number;
      bestDiscount: { price: number; offerName: string } | null;
    }>();

    for (const offer of allOffers) {
      // Only process offers that are currently active
      if (offer.status !== 'active') {
        continue;
      }

      // Check if this offer has any active discount types that can apply price discounts
      const activePriceDiscountTypes = offer.offerDiscountTypes.filter((dt: { isActive?: boolean; discountType?: string }) => 
        dt.isActive === true && (dt.discountType === 'percentage' || dt.discountType === 'fixed')
      );
      
      // If no active price discount types, skip this offer for price calculation
      if (activePriceDiscountTypes.length === 0) {
        continue;
      }

      for (const offerProduct of offer.offerProducts) {
        const productId = offerProduct.product.productId;
        const product = offerProduct.product;
        
        // Use originalSellingPrice if it exists, otherwise use current sellingPrice
        const originalPrice = product.originalSellingPrice 
          ? parseFloat(product.originalSellingPrice.replace(/[^\d.-]/g, '')) || 0
          : parseFloat(product.sellingPrice.replace(/[^\d.-]/g, '')) || 0;
        
        if (!productsWithOffers.has(productId)) {
          productsWithOffers.set(productId, {
            productId,
            offerId: offer.id,
            offerBadge: '',
            originalPrice,
            bestDiscount: null,
          });
        }

        // Calculate discount for this offer using only ACTIVE price discount types
        for (const discountType of activePriceDiscountTypes) {
          let discountedPrice = originalPrice;
          
          if (discountType.discountType === 'percentage') {
            discountedPrice = originalPrice * (1 - discountType.discountValue / 100);
          } else if (discountType.discountType === 'fixed') {
            discountedPrice = Math.max(0, originalPrice - discountType.discountValue);
          }

          // Keep the best discount (lowest price)
          const productData = productsWithOffers.get(productId);
          if (productData && (!productData.bestDiscount || discountedPrice < productData.bestDiscount.price)) {
            productData.bestDiscount = {
              price: discountedPrice,
              offerName: offer.name,
            };
          }
        }
      }
    }

    // Update products with offers
    for (const [productId, productData] of productsWithOffers) {
      if (productData.bestDiscount && productData.bestDiscount.price < productData.originalPrice) {
        const newPrice = String(productData.bestDiscount.price);
        await tx.product.update({
          where: { productId: productId },
          data: { 
            sellingPrice: newPrice,
            originalSellingPrice: String(productData.originalPrice), // Store original price
          },
        });
      }
    }

    // CRITICAL FIX: Restore original prices for ALL products that should not have active discounts
    // This includes products with no offers AND products with offers but no active discount types
    const productIdsWithActiveDiscounts = new Set(productsWithOffers.keys());
    
    for (const product of allProducts) {
      const shouldHaveDiscount = productIdsWithActiveDiscounts.has(product.productId);
      
      if (!shouldHaveDiscount) {
        // This product should NOT have a discount - restore original price
        if (product.originalSellingPrice) {
          // Product had a discount before, restore original price
          await tx.product.update({
            where: { productId: product.productId },
            data: { 
              sellingPrice: product.originalSellingPrice,
              originalSellingPrice: null, // Clear the original price field
            },
          });
        }
      }
    }
    
  } catch (error) {
    // Error handled silently
  }
}
