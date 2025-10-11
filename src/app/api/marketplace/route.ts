import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';
import { getProductSecurityHeaders } from '../../../utils/product-security';

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
    
    // Build where clause for published products only
    const whereClause: Record<string, unknown> = {
      marketplaceStatus: 'Published',
      status: 'Published'
    };
    
    // Build OR conditions for filtering
    const orConditions: any[] = [];
    
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
    
    // Get published products with user info
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
      orderBy: { publishedAt: 'desc' }
    });
    
    // Get active offers for all products
    const productIds = products.map(p => p.productId);
    const userIds = [...new Set(products.map(p => p.userId).filter((id): id is number => id !== null))];
    
    const activeOffers = await prisma.offer.findMany({
      where: {
        userId: { in: userIds },
        status: 'active',
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
        offerDiscountTypes: {
          where: {
            isActive: true
          }
        }
      }
    });
    
    // Create a map of product offers
    const productOffersMap = new Map();
    activeOffers.forEach((offer: any) => {
      offer.offerProducts.forEach((op: any) => {
        if (!productOffersMap.has(op.productId)) {
          productOffersMap.set(op.productId, []);
        }
        productOffersMap.get(op.productId).push(offer);
      });
    });
    
    // Transform products for marketplace format
    const marketplaceProducts = products.map(product => {
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
      
      // Check if product has active offers
      const productOffers = productOffersMap.get(product.productId) || [];
      let offerBadge = undefined;
      let hasActiveOffer = false;
      let offerId = undefined;
      let offerName = undefined;
      let originalSellingPrice = undefined;
      
      let promotionDetails = undefined;
      
      if (productOffers.length > 0) {
        const primaryOffer = productOffers[0];
        
        // Filter to only ACTIVE discount types
        const discountTypes = primaryOffer.offerDiscountTypes.filter((dt: any) => dt.isActive !== false);
        
        const hasDiscount = discountTypes.some((dt: any) => 
          dt.discountType === 'percentage' || dt.discountType === 'fixed'
        );
        const hasPromotion = discountTypes.some((dt: any) => 
          dt.discountType === 'buy_x_get_y'
        );
        
        if (hasDiscount && hasPromotion) {
          offerBadge = 'All Offers';
        } else if (hasPromotion) {
          offerBadge = 'Promotion';
        } else if (hasDiscount) {
          offerBadge = 'Discount';
        } else {
          offerBadge = 'Offer';
        }
        
        // Get Buy X Get Y promotion details
        const buyXGetYPromo = discountTypes.find((dt: any) => dt.discountType === 'buy_x_get_y');
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
        originalSellingPrice = product.originalSellingPrice ? 
          (typeof product.originalSellingPrice === 'string' 
            ? parseInt(product.originalSellingPrice.replace(/[^\d]/g, '')) || 0
            : product.originalSellingPrice) 
          : undefined;
      }
      
      return {
        id: product.productId,
        name: product.name,
        description: product.description,
        sellingPrice: sellingPrice,
        originalSellingPrice: originalSellingPrice,
        // Keep old field names for backward compatibility
        price: sellingPrice,
        originalPrice: purchasePrice,
        // Offer integration
        offerBadge,
        hasActiveOffer,
        offerId,
        offerName,
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
    });
    
    const totalCount = await prisma.product.count({ where: whereClause });
    
    return NextResponse.json({
      products: marketplaceProducts,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    }, { headers });
    
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
