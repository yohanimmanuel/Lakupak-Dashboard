import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { parseNumberByCurrency, formatNumberByCurrency } from '@/config/currencyConfig';
import { updateOfferStatusesBasedOnLimits } from '@/utils/offerValidation';
import { parseVariantPrice, parseVariantOriginalPrice } from '@/services/variantService';
import type { Prisma } from '@prisma/client';
import type {
  OfferDiscountTypeResult,
  OfferProductResult,
  DateRangeResult,
  TimeSlotResult,
  DiscountTypeInput,
  DateRangeInput,
  TimeSlotInput,
} from '@/types/offer-api';


// GET /api/offers - Get all offers for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }
    
    // Validate userId format
    if (!/^\d+$/.test(userId)) {
      return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
    }
    
    const user = { id: parseInt(userId) };

    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = {
      userId: user.id,
    };

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    // Get offers with pagination
    const offers = await prisma.offer.findMany({
      where,
      include: {
        offerProducts: {
          include: {
            product: {
              include: {
                variants: true
              }
            },
          },
        },
        offerDiscountTypes: true,
        dateRanges: true,
        timeSlots: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    // Get individual usage tracking for each discount type
    const offerIds = offers.map(offer => offer.id);
    const usageTracking = await prisma.offerUsageTracking.groupBy({
      by: ['offerId', 'discountTypeId'],
      where: {
        offerId: { in: offerIds }
      },
      _sum: {
        usageCount: true
      }
    });

    // Create a map for quick lookup
    const usageMap = new Map();
    usageTracking.forEach(usage => {
      const key = `${usage.offerId}-${usage.discountTypeId}`;
      usageMap.set(key, usage._sum.usageCount || 0);
    });

    // Get total count for pagination
    const totalCount = await prisma.offer.count({ where });

    // Transform the response
    const transformedOffers = offers.map((offer) => ({
      id: offer.id,
      offerId: offer.offerId,
      name: offer.name,
      description: offer.description,
      type: offer.type,
      status: offer.status,
      discountTypes: offer.offerDiscountTypes.map((dt) => ({
        id: dt.id,
        discountType: dt.discountType,
        discountValue: dt.discountValue,
        name: dt.name,
        description: dt.description,
          minOrderValue: dt.minOrderValue,
          minQuantity: dt.minQuantity,
          isActive: dt.isActive,
          priority: dt.priority,
        currentUsage: usageMap.get(`${offer.id}-${dt.id}`) || 0,
      })),
      startDate: offer.startDate,
      endDate: offer.endDate,
      totalUsage: offer.totalUsage,
      totalDiscountGiven: offer.totalDiscountGiven,
      products: offer.offerProducts.map((op) => ({
        id: op.id,
        productId: op.product.productId,
        name: op.product.name,
        productType: op.product.productType,
        productCategory: op.product.productCategory,
        sellingPrice: op.product.variants?.[0]?.sellingPrice || '0',
      })),
      dateRanges: offer.dateRanges?.map((dr) => ({
        id: dr.id,
        name: dr.name,
        description: dr.description,
        startDate: dr.startDate,
        endDate: dr.endDate,
        isActive: dr.isActive,
      })) || [],
      timeSlots: offer.timeSlots?.map((ts) => ({
        id: ts.id,
        name: ts.name,
        description: ts.description,
        startTime: ts.startTime,
        endTime: ts.endTime,
        days: ts.days || [],
        isActive: ts.isActive,
        createdAt: ts.createdAt,
        updatedAt: ts.updatedAt,
      })) || [],
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    }));

    return NextResponse.json({
      offers: transformedOffers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch offers' },
      { status: 500 }
    );
  }
}

// POST /api/offers - Create a new offer or handle special actions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Handle special actions
    if (body.action === 'update-status') {
      await updateOfferStatusesBasedOnLimits();
      return NextResponse.json({
        success: true,
        message: 'Offer statuses updated successfully'
      });
    }
    
    if (body.action === 'reset-prices') {
      await prisma.$transaction(async (tx) => {
        await resetProductPricesFromOffers(tx, user.id);
        await updateProductPricesFromOffers(tx, user.id);
      });
      return NextResponse.json({
        success: true,
        message: 'Product prices reset and updated successfully'
      });
    }
    
    if (body.action === 'update-prices') {
      await prisma.$transaction(async (tx) => {
        await updateProductPricesFromOffers(tx, user.id);
      });
      return NextResponse.json({
        success: true,
        message: 'Product prices updated successfully'
      });
    }
    
    if (!body.userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }
    
    // Validate userId format
    if (!/^\d+$/.test(String(body.userId))) {
      return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
    }
    
    const user = { id: parseInt(body.userId) };
          const {
            name,
            description,
            type,
            discountTypes,
            startDate,
            endDate,
            productIds,
            dateRanges = [],
            timeSlots = [],
            status = 'active',
          } = body;

    // Validate required fields
    if (!name || !type || !discountTypes?.length || !startDate || !endDate || !productIds?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate date range
          const start = new Date(startDate);
          const end = new Date(endDate);
    if (start >= end) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }
    
    // Check for overlapping active offers on the same products
    if (productIds && productIds.length > 0) {
      const overlappingOffers = await prisma.offer.findMany({
        where: {
          userId: user.id,
          status: 'active',
          OR: [
            {
              AND: [
                { startDate: { lte: end } },
                { endDate: { gte: start } }
              ]
            }
          ],
          offerProducts: {
            some: {
              productId: { in: productIds }
            }
          }
        },
        include: {
          offerProducts: {
            where: {
              productId: { in: productIds }
            },
            include: {
              product: {
                select: { name: true }
              }
            }
          }
        }
      });
      
      if (overlappingOffers.length > 0) {
        const overlappingProductNames = overlappingOffers
          .flatMap(o => o.offerProducts.map(op => op.product.name))
          .filter((name, index, arr) => arr.indexOf(name) === index)
          .slice(0, 3)
          .join(', ');
        
        return NextResponse.json(
          { 
            error: 'Date range conflict detected',
            message: `Some products already have active offers in this date range: ${overlappingProductNames}${overlappingOffers.flatMap(o => o.offerProducts).length > 3 ? '...' : ''}`,
            warning: true // This allows the frontend to show as a warning instead of error
          },
          { status: 409 }
        );
      }
    }

    // Validate discount types
    for (const discountType of discountTypes) {
      if (discountType.discountValue <= 0) {
        return NextResponse.json(
          { error: 'Discount value must be greater than 0' },
          { status: 400 }
        );
      }
      if (discountType.discountType === 'percentage' && discountType.discountValue > 100) {
        return NextResponse.json(
          { error: 'Percentage discount cannot exceed 100%' },
          { status: 400 }
        );
      }
    }

    // Check if products exist and belong to user
    const userProducts = await prisma.product.findMany({
      where: {
        userId: user.id,
        productId: {
          in: productIds,
        },
      },
      select: {
        productId: true,
      },
    });

    if (userProducts.length !== productIds.length) {
      return NextResponse.json(
        { error: 'Some products do not exist or do not belong to you' },
        { status: 400 }
      );
    }

    // Generate unique offer ID
    const offerId = `OFF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create offer with products in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create the offer
      const offer = await tx.offer.create({
        data: {
          offerId,
          name,
          description,
          type,
          status,
          startDate: start,
          endDate: end,
          userId: user.id,
        },
      });

      // Create discount types
      const offerDiscountTypes = await tx.offerDiscountType.createMany({
        data: discountTypes.map((dt: DiscountTypeInput) => ({
          offerId: offer.id,
          discountType: dt.discountType,
          discountValue: dt.discountValue,
          name: dt.name,
          description: dt.description,
          minOrderValue: dt.minOrderValue ? 
            (typeof dt.minOrderValue === 'string' ? parseFloat(dt.minOrderValue.replace(/\./g, '')) : dt.minOrderValue) : 
            undefined,
            minQuantity: dt.minQuantity,
            isActive: dt.isActive,
          priority: dt.priority,
        })),
      });

      // Create offer-product relationships
      const offerProducts = await tx.offerProduct.createMany({
        data: productIds.map((productId: string) => ({
          offerId: offer.id,
          productId,
        })),
      });

      // Create date ranges
      if (dateRanges.length > 0) {
        await tx.dateRange.createMany({
          data: dateRanges.map((dr: DateRangeInput) => ({
            offerId: offer.id,
            name: dr.name,
            description: dr.description,
            startDate: dr.startDate ? new Date(dr.startDate) : new Date(),
            endDate: dr.endDate ? new Date(dr.endDate) : new Date(),
            isActive: dr.isActive ?? true,
          })),
        });
      }

      // Create time slots
      if (timeSlots.length > 0) {
        await tx.timeSlot.createMany({
          data: timeSlots.map((ts: TimeSlotInput) => ({
            offerId: offer.id,
            name: ts.name,
            description: ts.description,
            startTime: ts.startTime,
            endTime: ts.endTime,
            isActive: ts.isActive ?? true,
          })),
        });
      }

      return offer;
    });

    // Update product prices based on all active offers for this user
    await prisma.$transaction(async (tx) => {
      // First, ensure all product variants have originalSellingPrice set
      const productsWithVariants = await tx.product.findMany({
        where: { userId: user.id },
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
      
      // First reset prices for products that no longer have active offers
      await resetProductPricesFromOffers(tx, user.id);
      // Then apply current active offers
      await updateProductPricesFromOffers(tx, user.id);
    });

    // Update lastSyncAt for marketplace sync
    await prisma.product.updateMany({
      where: {
        userId: user.id,
        offerProducts: {
          some: {
            offerId: result.id
          }
        }
      },
      data: {
        lastSyncAt: new Date()
      }
    });

    // Fetch the created offer with products and discount types
    const createdOffer = await prisma.offer.findUnique({
      where: { id: result.id },
      include: {
        offerProducts: {
          include: {
            product: {
              include: {
                variants: true
              }
            },
          },
        },
        offerDiscountTypes: true,
        dateRanges: true,
        timeSlots: true,
      },
    });

    // Transform the response
    const transformedOffer = {
      id: createdOffer!.id,
      offerId: createdOffer!.offerId,
      name: createdOffer!.name,
      description: createdOffer!.description,
      type: createdOffer!.type,
      status: createdOffer!.status,
      discountTypes: createdOffer!.offerDiscountTypes.map((dt) => ({
        id: dt.id,
        discountType: dt.discountType,
        discountValue: dt.discountValue,
        name: dt.name,
        description: dt.description,
          minOrderValue: dt.minOrderValue,
          minQuantity: dt.minQuantity,
          isActive: dt.isActive,
          priority: dt.priority,
      })),
      startDate: createdOffer!.startDate,
      endDate: createdOffer!.endDate,
      totalUsage: createdOffer!.totalUsage,
      totalDiscountGiven: createdOffer!.totalDiscountGiven,
      products: createdOffer!.offerProducts.map((op) => ({
        id: op.id,
        productId: op.product.productId,
        name: op.product.name,
        productType: op.product.productType,
        productCategory: op.product.productCategory,
        sellingPrice: op.product.variants?.[0]?.sellingPrice || '0',
      })),
      dateRanges: createdOffer!.dateRanges?.map((dr) => ({
        id: dr.id,
        name: dr.name,
        description: dr.description,
        startDate: dr.startDate,
        endDate: dr.endDate,
        isActive: dr.isActive,
      })) || [],
      timeSlots: createdOffer!.timeSlots?.map((ts) => ({
        id: ts.id,
        name: ts.name,
        description: ts.description,
        startTime: ts.startTime,
        endTime: ts.endTime,
        isActive: ts.isActive,
      })) || [],
      createdAt: createdOffer!.createdAt,
      updatedAt: createdOffer!.updatedAt,
    };

    return NextResponse.json(transformedOffer, { status: 201 });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create offer' },
      { status: 500 }
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
          offerDiscountTypes: true
        }
      });

      for (const variant of product.variants) {
        // Get original price (if not set, use current selling price)
        // If originalSellingPrice is already set, use it; otherwise use current sellingPrice
        const originalPrice = variant.originalSellingPrice ? 
          (parseVariantOriginalPrice(variant) || parseVariantPrice(variant)) : 
          parseVariantPrice(variant);

        let finalPrice = originalPrice;
        let hasOffer = false;

        // Apply discount if there are active offers
        if (productOffers.length > 0) {
          const offer = productOffers[0];
          let bestDiscountAmount = 0;
          let bestDiscountType = null;
          
          // Check all discount types and find the best one
          for (const discountType of offer.offerDiscountTypes) {
            // Skip if discount type is not active
            if (!discountType.isActive) {
              continue;
            }
            
            // All active discount types are usable (no usage limits)
            if (discountType.isActive) {
              let discountAmount = 0;
              
              if (discountType.discountType === 'percentage') {
                discountAmount = (originalPrice * discountType.discountValue) / 100;
              } else if (discountType.discountType === 'fixed') {
                discountAmount = discountType.discountValue;
              }
              
              // Keep the best discount
              if (discountAmount > bestDiscountAmount) {
                bestDiscountAmount = discountAmount;
                bestDiscountType = discountType;
              }
            }
          }
          
          // Apply the best discount found
          if (bestDiscountType && bestDiscountAmount > 0) {
            if (bestDiscountType.discountType === 'percentage') {
              finalPrice = originalPrice * (1 - bestDiscountType.discountValue / 100);
            } else if (bestDiscountType.discountType === 'fixed') {
              finalPrice = Math.max(0, originalPrice - bestDiscountType.discountValue);
            }
            hasOffer = true;
          } else {
            // No usable discount types, reset to original price
            finalPrice = originalPrice;
            hasOffer = false;
          }
        } else {
          // No active offers, reset to original price
          finalPrice = originalPrice;
          hasOffer = false;
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

// Helper function to reset product prices when offers are removed or expired
async function resetProductPricesFromOffers(tx: Prisma.TransactionClient, userId: number) {
  try {
    // Get all products for this user that have variants with originalSellingPrice set
    const productsWithOriginalPrices = await tx.product.findMany({
      where: {
        userId: userId,
        variants: {
          some: {
            originalSellingPrice: {
              not: null
            }
          }
        }
      },
      include: { variants: true }
    });

    // Get all active offers for this user to check which products still have active offers
    const activeOffers = await tx.offer.findMany({
      where: {
        userId: userId,
        status: 'active',
      },
      include: {
        offerProducts: true,
      },
    });

    // Get product IDs that still have active offers
    const productsWithActiveOffers = new Set(
      activeOffers.flatMap((offer: { offerProducts: { productId: string }[] }) => offer.offerProducts.map((op: { productId: string }) => op.productId))
    );

    // Reset ALL products with originalSellingPrice set, regardless of active offers
    // This ensures that when offers are reactivated, we start with a clean slate
    for (const product of productsWithOriginalPrices) {
      for (const variant of product.variants) {
        if (variant.originalSellingPrice) {
          // Reset selling price to original price but keep originalSellingPrice
          // The updateProductPricesFromOffers function will decide whether to clear it
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              sellingPrice: variant.originalSellingPrice
            }
          });
        }
      }
    }
  } catch (error) {
  }
}

// DELETE /api/offers - Delete an offer and reset affected product prices
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const offerId = searchParams.get('offerId');
    const userId = searchParams.get('userId');
    
    if (!offerId || !userId) {
      return NextResponse.json({ error: 'Missing offerId or userId parameter' }, { status: 400 });
    }
    
    // Validate userId format
    if (!/^\d+$/.test(userId)) {
      return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
    }
    
    const user = { id: parseInt(userId) };

    // Delete the offer and reset affected product prices
    await prisma.$transaction(async (tx) => {
      // First delete the offer (this will cascade delete related records)
      await tx.offer.delete({
        where: { 
          id: offerId,
          userId: user.id 
        }
      });

      // Then reset prices for products that no longer have active offers
      await resetProductPricesFromOffers(tx, user.id);
    });

    return NextResponse.json({
      success: true,
      message: 'Offer deleted successfully and product prices reset'
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete offer' },
      { status: 500 }
    );
  }
}
