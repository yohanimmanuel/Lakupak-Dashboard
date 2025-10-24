import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '../../../generated/prisma';
import { 
  getProductSecurityHeaders, 
  validateProductInput, 
  sanitizeProductData,
  validateProductUpdate,
  generateUniqueProductId
} from '../../../utils/product-security';
import { parseNumberByCurrency } from '../../../config/currencyConfig';

interface OfferDiscountType {
  id: string;
  discountType: string;
  discountValue: number;
  minQuantity: number | null;
  freeQuantity?: number | null;
  isActive: boolean;
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

export async function GET(req: NextRequest) {
  const headers = getProductSecurityHeaders();
  
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      let product;
      if (/^\d+$/.test(id)) {
        product = await prisma.product.findFirst({
          where: { id: Number(id), userId: Number(userId) },
          include: { variants: true }
        });
      } else {
        product = await prisma.product.findFirst({
          where: { productId: id, userId: Number(userId) },
          include: { variants: true }
        });
      }
      
      if (!product) {
        return NextResponse.json(
          { error: 'Product not found' }, 
          { status: 404, headers }
        );
      }
      
      // Check if product has active offers for badge display
      const activeOffers = await prisma.offer.findMany({
        where: {
          status: 'active',
          userId: Number(userId),
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
          offerProducts: {
            some: {
              productId: product.productId
            }
          },
          // Only fetch offers that have at least one active discount type
          offerDiscountTypes: {
            some: {
              isActive: true
            }
          }
        },
        include: {
          offerProducts: {
            where: {
              productId: product.productId
            }
          },
          offerDiscountTypes: {
            where: {
              isActive: true
            }
          }
        }
      });

      // Get individual usage tracking for each discount type
      const offerIds = activeOffers.map(offer => offer.id);
      const usageTracking = offerIds.length > 0 ? await prisma.offerUsageTracking.groupBy({
        by: ['offerId', 'discountTypeId'],
        where: {
          offerId: { in: offerIds }
        },
        _sum: {
          usageCount: true
        }
      }) : [];

      // Create a map for quick lookup
      const usageMap = new Map();
      usageTracking.forEach(usage => {
        const key = `${usage.offerId}-${usage.discountTypeId}`;
        usageMap.set(key, usage._sum.usageCount || 0);
      });
      
      if (activeOffers.length > 0) {
        const primaryOffer = activeOffers[0];
        
        // Filter to only ACTIVE discount types
        const discountTypes = primaryOffer.offerDiscountTypes.filter((dt) => dt.isActive !== false);
        
        // Check if all offer types have reached their maximum usage using individual usage tracking
        const typesWithLimits = discountTypes.filter(dt => dt.maxUsage && dt.maxUsage > 0);
        let allLimitsReached = true;
        
        if (typesWithLimits.length > 0) {
          allLimitsReached = typesWithLimits.every(dt => {
            const currentUsage = usageMap.get(`${primaryOffer.id}-${dt.id}`) || 0;
            return currentUsage >= (dt.maxUsage || 0);
          });
        } else {
          allLimitsReached = false;
        }
        
        // If all limits are reached or no active discount types, don't show offer badge
        if (discountTypes.length === 0 || allLimitsReached) {
          return NextResponse.json(product, { headers });
        }
        
        const hasDiscount = discountTypes.some((dt) => 
          dt.discountType === 'percentage' || dt.discountType === 'fixed'
        );
        const hasPromotion = discountTypes.some((dt) => 
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
        
        // Get discount type and value (prioritize fixed over percentage)
        const fixedDiscount = discountTypes.find((dt) => dt.discountType === 'fixed');
        const percentageDiscount = discountTypes.find((dt) => dt.discountType === 'percentage');
        const discountType = fixedDiscount ? 'fixed' : (percentageDiscount ? 'percentage' : undefined);
        const discountValue = fixedDiscount ? fixedDiscount.discountValue : (percentageDiscount ? percentageDiscount.discountValue : undefined);
        
        // Get Buy X Get Y promotion details
        const buyXGetYPromo = discountTypes.find((dt) => dt.discountType === 'buy_x_get_y');
        const promotionDetails = buyXGetYPromo ? {
          minQuantity: buyXGetYPromo.minQuantity,
          freeQuantity: buyXGetYPromo.discountValue,
          description: buyXGetYPromo.description || `Buy ${buyXGetYPromo.minQuantity} Get ${buyXGetYPromo.discountValue} Free`
        } : undefined;
        
        return NextResponse.json({
          ...product,
          offerBadge,
          originalPrice: (product as { variants?: Array<{ originalSellingPrice?: string }> })?.variants?.[0]?.originalSellingPrice || undefined,
          hasActiveOffer: true,
          offerId: primaryOffer.id,
          offerName: primaryOffer.name,
          discountType,
          discountValue,
          promotionDetails
        }, { headers });
      }
      
      return NextResponse.json(product, { headers });
    }
    
    // Get all products with pagination support
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const search = req.nextUrl.searchParams.get('search') || '';
    const status = req.nextUrl.searchParams.get('status') || '';
    const productType = req.nextUrl.searchParams.get('productType') || req.nextUrl.searchParams.get('category') || '';
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' }, 
        { status: 400, headers }
      );
    }
    
    // Build where clause
    const whereClause: {
      userId: number;
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        sku?: { contains: string; mode: 'insensitive' };
        productType?: { contains: string; mode: 'insensitive' };
        brand?: { contains: string; mode: 'insensitive' };
        supplier?: { contains: string; mode: 'insensitive' };
      }>;
      status?: string;
      productType?: string;
    } = { userId: Number(userId) };
    
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { productType: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { supplier: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status && status !== 'All') {
      whereClause.status = status;
    }
    
    if (productType && productType !== 'All Categories') {
      whereClause.productType = productType;
    }
    
    // Get total count for pagination
    const totalCount = await prisma.product.count({ where: whereClause });
    
    // Get paginated results
    const products = await prisma.product.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        variants: true
      }
    });
    
    // Fetch active offers for all products
    const productIds = products.map(p => p.productId);
    const activeOffers = await prisma.offer.findMany({
      where: {
        status: 'active',
        userId: Number(userId),
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        offerProducts: {
          some: {
            productId: { in: productIds }
          }
        },
        // Only fetch offers that have at least one active discount type
        offerDiscountTypes: {
          some: {
            isActive: true
          }
        }
      },
      include: {
        offerProducts: {
          where: {
            productId: { in: productIds }
          }
        },
        offerDiscountTypes: {
          where: {
            isActive: true
          },
          orderBy: {
            priority: 'desc'
          }
        }
      }
    });

    // Get individual usage tracking for all offers
    const allOfferIds = activeOffers.map(offer => offer.id);
    const allUsageTracking = allOfferIds.length > 0 ? await prisma.offerUsageTracking.groupBy({
      by: ['offerId', 'discountTypeId'],
      where: {
        offerId: { in: allOfferIds }
      },
      _sum: {
        usageCount: true
      }
    }) : [];

    // Create a map for quick lookup
    const allUsageMap = new Map();
    allUsageTracking.forEach(usage => {
      const key = `${usage.offerId}-${usage.discountTypeId}`;
      allUsageMap.set(key, usage._sum.usageCount || 0);
    });
    
    // Map offers to products
    const productsWithOffers = products.map(product => {
      const productOffers = activeOffers.filter((offer: ActiveOffer) => 
        offer.offerProducts.some((p) => p.productId === product.productId)
      );
      
      if (productOffers.length === 0) {
        return product;
      }
      
      // Get the highest priority offer
      const primaryOffer = productOffers[0];
      
      // Filter to only ACTIVE discount types
      const discountTypes = primaryOffer.offerDiscountTypes.filter((dt) => dt.isActive !== false);
      
      // Check if all offer types have reached their maximum usage using individual usage tracking
      const typesWithLimits = discountTypes.filter(dt => dt.maxUsage && dt.maxUsage > 0);
      let allLimitsReached = true;
      
      if (typesWithLimits.length > 0) {
        allLimitsReached = typesWithLimits.every(dt => {
          const currentUsage = allUsageMap.get(`${primaryOffer.id}-${dt.id}`) || 0;
          return currentUsage >= (dt.maxUsage || 0);
        });
      } else {
        allLimitsReached = false;
      }
      
      // If all limits are reached or no active discount types, don't show offer badge
      if (discountTypes.length === 0 || allLimitsReached) {
        return product;
      }
      
      // Determine badge type based on applied discount types
      const hasDiscount = discountTypes.some((dt) => 
        dt.discountType === 'percentage' || dt.discountType === 'fixed'
      );
      const hasPromotion = discountTypes.some((dt) => 
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
      
      // Get discount type and value (prioritize fixed over percentage)
      const fixedDiscount = discountTypes.find((dt) => dt.discountType === 'fixed');
      const percentageDiscount = discountTypes.find((dt) => dt.discountType === 'percentage');
      const discountType = fixedDiscount ? 'fixed' : (percentageDiscount ? 'percentage' : undefined);
      const discountValue = fixedDiscount ? fixedDiscount.discountValue : (percentageDiscount ? percentageDiscount.discountValue : undefined);
      
      // Get Buy X Get Y promotion details
      const buyXGetYPromo = discountTypes.find((dt) => dt.discountType === 'buy_x_get_y');
      const promotionDetails = buyXGetYPromo ? {
        minQuantity: buyXGetYPromo.minQuantity,
        freeQuantity: buyXGetYPromo.discountValue,
        description: buyXGetYPromo.description || `Buy ${buyXGetYPromo.minQuantity} Get ${buyXGetYPromo.discountValue} Free`
      } : undefined;
      
      return {
        ...product,
        offerBadge,
          originalPrice: (product as { variants?: Array<{ originalSellingPrice?: string }> }).variants?.[0]?.originalSellingPrice || undefined,
        hasActiveOffer: true,
        offerId: primaryOffer.id,
        offerName: primaryOffer.name,
        discountType,
        discountValue,
        promotionDetails
      };
    });
    
    return NextResponse.json({
      products: productsWithOffers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function POST(req: NextRequest) {
  const headers = getProductSecurityHeaders();
  
  try {
    const data = await req.json();
    
    if (!data.userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }

    // Handle special actions
    if (data.action === 'reset-original-prices') {
      const result = await resetOriginalPricesForUser(Number(data.userId));
      return NextResponse.json(result, { headers });
    }
    
    if (data.action === 'apply-offers-to-all-products') {
      await updateProductPricesFromOffers(prisma, Number(data.userId));
      return NextResponse.json({
        success: true,
        message: 'Applied offers to all products successfully'
      }, { headers });
    }
    
    if (data.action === 'update-prices-from-offers') {
      await updateProductPricesFromOffers(prisma, Number(data.userId));
      return NextResponse.json({
        success: true,
        message: 'Product prices updated from offers successfully'
      }, { headers });
    }
    
    if (data.action === 'force-update-prices') {
      await prisma.$transaction(async (tx) => {
        // First, ensure all product variants have originalSellingPrice set
        const productsWithVariants = await tx.product.findMany({
          where: { userId: Number(data.userId) },
          include: { variants: true }
        });
        
        for (const product of productsWithVariants) {
          for (const variant of product.variants) {
            if (!variant.originalSellingPrice) {
              await tx.productVariant.update({
                where: { id: variant.id },
                data: { originalSellingPrice: variant.sellingPrice }
              });
            }
          }
        }
        
        // Then apply current active offers
        await updateProductPricesFromOffers(tx, Number(data.userId));
      });
      return NextResponse.json({
        success: true,
        message: 'Product prices force updated successfully'
      }, { headers });
    }
    
    if (data.action === 'reset-product-prices') {
      const productId = data.productId;
      if (!productId) {
        return NextResponse.json({
          error: 'Product ID is required for reset action'
        }, { status: 400, headers });
      }
      
      await prisma.$transaction(async (tx) => {
        // Get the product with its variants
        const product = await tx.product.findFirst({
          where: { productId: productId, userId: Number(data.userId) },
          include: { variants: true }
        });
        
        if (product) {
          for (const variant of product.variants) {
            if (variant.originalSellingPrice) {
              // Reset to original price and clear originalSellingPrice
              await tx.productVariant.update({
                where: { id: variant.id },
                data: {
                  sellingPrice: variant.originalSellingPrice,
                  originalSellingPrice: null
                }
              });
            }
          }
        }
      });
      
      return NextResponse.json({
        success: true,
        message: 'Product prices reset to original successfully'
      }, { headers });
    }
    
    
    
    // Validate userId format
    if (!/^\d+$/.test(String(data.userId))) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    // Sanitize and prepare product data
    const productData = {
      productId: data.productId || generateUniqueProductId(),
      sku: data.sku || '',
      name: data.name || '',
      description: data.description || '',
      productType: data.productType || '',
      brand: data.brand || '',
      supplier: data.supplier || '',
      status: data.status || 'Draft',
      productCategory: data.productCategory || '',
      catalogName: data.catalogName || '',
      images: Array.isArray(data.images) ? data.images : [],
      // Product assurance fields
      halalCertified: data.halalCertified === true,
      bpomApproved: data.bpomApproved === true,
      originalProduct: data.originalProduct !== false,
      returnPolicyDays: data.returnPolicyDays !== undefined ? Number(data.returnPolicyDays) : 7,
      userId: Number(data.userId)
    };
    
    // Check for unique productId
    if (productData.productId) {
      const existingProduct = await prisma.product.findFirst({
        where: { productId: productData.productId, userId: productData.userId }
      });
      
      if (existingProduct) {
        // Generate a new unique ID and retry
        productData.productId = generateUniqueProductId();
      }
    }
    
    const product = await prisma.product.create({
      data: {
        ...productData,
        variants: data.variants ? {
          create: data.variants.map((variant: {
            variantName: string;
            packageType: string;
            piecesPerPackage: number;
            stockQuantity: number;
            lowStockThreshold: number;
            stockStatus: string;
            purchasePrice: string;
            sellingPrice: string;
            originalSellingPrice?: string;
            isDefault: boolean;
            isActive: boolean;
          }) => ({
            variantName: variant.variantName,
            packageType: variant.packageType || '',
            piecesPerPackage: variant.piecesPerPackage || 1,
            stockQuantity: variant.stockQuantity || 0,
            lowStockThreshold: variant.lowStockThreshold || 0,
            stockStatus: variant.stockStatus || 'In Stock',
                 purchasePrice: String(parseNumberByCurrency(String(variant.purchasePrice || ''), data.currency || 'IDR')),
                 sellingPrice: String(parseNumberByCurrency(String(variant.sellingPrice || ''), data.currency || 'IDR')),
                 originalSellingPrice: String(parseNumberByCurrency(String(variant.sellingPrice || ''), data.currency || 'IDR')),
                 isDefault: variant.isDefault || false,
                 isActive: variant.isActive !== false
          }))
        } : undefined
      },
      include: {
        variants: true
      }
    });
    
    // Update product prices based on active offers after creation
    await updateProductPricesFromOffers(prisma, Number(data.userId));
    
    // Fetch the updated product with new prices
    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: { variants: true }
    });
    
    return NextResponse.json(updatedProduct, { status: 201, headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const headers = getProductSecurityHeaders();
  
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(userId)) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { error: 'Missing id parameter' }, 
        { status: 400, headers }
      );
    }
    
    let deleted;
    if (/^\d+$/.test(id)) {
      deleted = await prisma.product.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Product not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.product.delete({
        where: { id: Number(id) }
      });
    } else {
      deleted = await prisma.product.findFirst({
        where: { productId: id, userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Product not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.product.delete({
        where: { productId: id }
      });
    }
    
    return NextResponse.json({ success: true, deleted }, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to delete product' }, 
      { status: 500, headers }
    );
  }
}

// Helper function to update product prices based on active offers
async function updateProductPricesFromOffers(tx: Prisma.TransactionClient, userId: number) {
  try {
    // Get all products for this user
    const products = await tx.product.findMany({
      where: { userId: userId },
      include: { variants: true }
    });

    for (const product of products) {
      // Get active offers for this product
      const productOffers = await tx.offer.findMany({
        where: {
          userId: userId,
          status: 'active',
          offerProducts: {
            some: { productId: product.productId }
          }
        },
        include: {
          offerDiscountTypes: {
            where: { isActive: true }
          }
        }
      });

      for (const variant of product.variants) {
        // Get original price (if not set, use current selling price)
        const originalPrice = variant.originalSellingPrice 
          ? parseFloat(variant.originalSellingPrice.replace(/[^\d.-]/g, '')) || 0
          : parseFloat(variant.sellingPrice.replace(/[^\d.-]/g, '')) || 0;

        let finalPrice = originalPrice;
        let hasOffer = false;

        // Apply discount if there are active offers
        if (productOffers.length > 0) {
          const offer = productOffers[0];
          const discountType = offer.offerDiscountTypes[0];
          
          if (discountType) {
            if (discountType.discountType === 'percentage') {
              finalPrice = originalPrice * (1 - discountType.discountValue / 100);
              hasOffer = true;
            } else if (discountType.discountType === 'fixed') {
              finalPrice = Math.max(0, originalPrice - discountType.discountValue);
              hasOffer = true;
            }
          }
        }

        // Update the variant
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            sellingPrice: String(Math.round(finalPrice)),
            originalSellingPrice: hasOffer ? String(Math.round(originalPrice)) : null
          }
        });
      }
    }
  } catch (error) {
  }
}

// Helper function to reset originalSellingPrice for products with null values
async function resetOriginalPricesForUser(userId: number) {
  try {
    // Find all product variants with null originalSellingPrice
    const variantsWithNullOriginalPrice = await prisma.productVariant.findMany({
      where: {
        originalSellingPrice: null,
        product: {
          userId: userId
        }
      },
      include: {
        product: true
      }
    });

    // Update variants to set originalSellingPrice = sellingPrice
    const updatePromises = variantsWithNullOriginalPrice.map(variant => 
      prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          originalSellingPrice: variant.sellingPrice
        }
      })
    );

    await Promise.all(updatePromises);

    return {
      success: true,
      message: `Reset originalSellingPrice for ${variantsWithNullOriginalPrice.length} variants`,
      updatedCount: variantsWithNullOriginalPrice.length
    };
  } catch (error) {
    throw error;
  }
}

export async function PUT(req: NextRequest) {
  const headers = getProductSecurityHeaders();
  
  try {
    const data = await req.json();
    
    if (!data.userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(String(data.userId))) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    const { id, productId, userId, ...updateData } = data;
    const userIdNum = Number(userId);
    
    // Clean the update data to ensure proper types
    const cleanUpdateData: Partial<{
      sku: string;
      name: string;
      description: string;
      productType: string;
      brand: string;
      supplier: string;
      status: string;
      productCategory: string;
      catalogName: string;
      images: string[];
      halalCertified: boolean;
      bpomApproved: boolean;
      originalProduct: boolean;
      returnPolicyDays: number;
    }> = {};
    if (updateData.sku !== undefined) cleanUpdateData.sku = String(updateData.sku);
    if (updateData.name !== undefined) cleanUpdateData.name = String(updateData.name);
    if (updateData.description !== undefined) cleanUpdateData.description = String(updateData.description);
    if ('productType' in updateData && updateData.productType !== undefined) cleanUpdateData.productType = String(updateData.productType);
    if (updateData.brand !== undefined) cleanUpdateData.brand = String(updateData.brand);
    if (updateData.supplier !== undefined) cleanUpdateData.supplier = String(updateData.supplier);
    if (updateData.status !== undefined) cleanUpdateData.status = String(updateData.status);
    if ('productCategory' in updateData && updateData.productCategory !== undefined) cleanUpdateData.productCategory = String(updateData.productCategory);
    if (updateData.catalogName !== undefined) cleanUpdateData.catalogName = String(updateData.catalogName);
    if (updateData.images !== undefined) cleanUpdateData.images = Array.isArray(updateData.images) ? updateData.images : [];
    if (updateData.halalCertified !== undefined) cleanUpdateData.halalCertified = Boolean(updateData.halalCertified);
    if (updateData.bpomApproved !== undefined) cleanUpdateData.bpomApproved = Boolean(updateData.bpomApproved);
    if (updateData.originalProduct !== undefined) cleanUpdateData.originalProduct = Boolean(updateData.originalProduct);
    if (updateData.returnPolicyDays !== undefined) cleanUpdateData.returnPolicyDays = Number(updateData.returnPolicyDays);
    
    // PUT /api/products - Cleaned update data
    
    let product;
    if (id) {
      product = await prisma.product.update({
        where: { id: Number(id), userId: userIdNum },
        data: {
          ...cleanUpdateData,
          ...(data.variants && {
            variants: {
              deleteMany: {}, // Delete all existing variants
              create: data.variants.map((variant: {
            variantName: string;
            packageType: string;
            piecesPerPackage: number;
            stockQuantity: number;
            lowStockThreshold: number;
            stockStatus: string;
            purchasePrice: string;
            sellingPrice: string;
            originalSellingPrice?: string;
            isDefault: boolean;
            isActive: boolean;
          }) => ({
                variantName: variant.variantName || 'Default Variant',
                packageType: variant.packageType || '',
                piecesPerPackage: variant.piecesPerPackage || 1,
                stockQuantity: variant.stockQuantity || 0,
                lowStockThreshold: variant.lowStockThreshold || 0,
                stockStatus: variant.stockStatus || 'In Stock',
                 purchasePrice: String(parseNumberByCurrency(String(variant.purchasePrice || ''), data.currency || 'IDR')),
                 sellingPrice: String(parseNumberByCurrency(String(variant.sellingPrice || ''), data.currency || 'IDR')),
                 originalSellingPrice: variant.originalSellingPrice,
                 isDefault: variant.isDefault || false,
                 isActive: variant.isActive !== false
              }))
            }
          })
        },
        include: {
          variants: true
        }
      });
    } else if (productId) {
      product = await prisma.product.update({
        where: { productId: productId, userId: userIdNum },
        data: {
          ...cleanUpdateData,
          ...(data.variants && {
            variants: {
              deleteMany: {}, // Delete all existing variants
              create: data.variants.map((variant: {
            variantName: string;
            packageType: string;
            piecesPerPackage: number;
            stockQuantity: number;
            lowStockThreshold: number;
            stockStatus: string;
            purchasePrice: string;
            sellingPrice: string;
            originalSellingPrice?: string;
            isDefault: boolean;
            isActive: boolean;
          }) => ({
                variantName: variant.variantName || 'Default Variant',
                packageType: variant.packageType || '',
                piecesPerPackage: variant.piecesPerPackage || 1,
                stockQuantity: variant.stockQuantity || 0,
                lowStockThreshold: variant.lowStockThreshold || 0,
                stockStatus: variant.stockStatus || 'In Stock',
                 purchasePrice: String(parseNumberByCurrency(String(variant.purchasePrice || ''), data.currency || 'IDR')),
                 sellingPrice: String(parseNumberByCurrency(String(variant.sellingPrice || ''), data.currency || 'IDR')),
                 originalSellingPrice: variant.originalSellingPrice,
                 isDefault: variant.isDefault || false,
                 isActive: variant.isActive !== false
              }))
            }
          })
        },
        include: {
          variants: true
        }
      });
    } else {
      return NextResponse.json({ error: 'Missing id or productId' }, { status: 400 });
    }
    
    // Update product prices based on active offers after update
    await updateProductPricesFromOffers(prisma, userIdNum);
    
    // Fetch the updated product with new prices
    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: { variants: true }
    });
    
    // Ensure we always return the productId for proper routing
    const responseData = {
      ...updatedProduct,
      productId: updatedProduct?.productId || productId
    };
    
    return NextResponse.json(responseData, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to update product' }, 
      { status: 500, headers }
    );
  }
}
