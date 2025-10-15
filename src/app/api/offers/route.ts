import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { parseNumberByCurrency, formatNumberByCurrency } from '@/config/currencyConfig';
import { updateOfferStatusesBasedOnLimits } from '@/utils/offerValidation';
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

// Extended session user type to include the id property
interface ExtendedUser {
  id: number;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

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
              select: {
                productId: true,
                name: true,
                productType: true,
                productCategory: true,
                sellingPrice: true,
              },
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
        maxUsage: dt.maxUsage,
        isActive: dt.isActive,
        priority: dt.priority,
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
        sellingPrice: op.product.sellingPrice,
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
          maxUsage: dt.maxUsage,
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
    await updateProductPricesFromOffers(prisma, user.id);

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
              select: {
                productId: true,
                name: true,
                productType: true,
                productCategory: true,
                sellingPrice: true,
              },
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
          maxUsage: dt.maxUsage,
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
        sellingPrice: op.product.sellingPrice,
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
    const allProducts = await tx.product.findMany({
      where: { userId: userId },
      select: {
        productId: true,
        sellingPrice: true,
        originalSellingPrice: true,
      },
    });

    // Get all active offers for this user
    const activeOffers = await tx.offer.findMany({
      where: {
        userId: userId,
        status: 'active',
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
        offerDiscountTypes: {
          where: {
            isActive: true,
          },
        },
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

    for (const offer of activeOffers) {
      for (const offerProduct of offer.offerProducts) {
        const productId = offerProduct.product.productId;
        const product = offerProduct.product;
        
        // Use originalSellingPrice if it exists, otherwise use current sellingPrice
        const originalPrice = product.originalSellingPrice 
          ? parseNumberByCurrency(product.originalSellingPrice, 'IDR')
          : parseNumberByCurrency(product.sellingPrice, 'IDR');
        
        if (!productsWithOffers.has(productId)) {
          productsWithOffers.set(productId, {
            productId,
            offerId: offer.id,
            offerBadge: '',
            originalPrice,
            bestDiscount: null,
          });
        }

        // Calculate discount for this offer
        for (const discountType of offer.offerDiscountTypes) {
          let discountedPrice = originalPrice;
          
          if (discountType.discountType === 'percentage') {
            discountedPrice = originalPrice * (1 - discountType.discountValue / 100);
          } else if (discountType.discountType === 'fixed') {
            discountedPrice = Math.max(0, originalPrice - discountType.discountValue);
          }
          // Skip buy_x_get_y for price calculation as it's a promotion, not a discount

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

    // Restore original prices for products that no longer have active offers
    const productIdsWithOffers = new Set(productsWithOffers.keys());
    for (const product of allProducts) {
      if (!productIdsWithOffers.has(product.productId) && product.originalSellingPrice) {
        // This product had an offer before but doesn't anymore, restore original price
        await tx.product.update({
          where: { productId: product.productId },
          data: { 
            sellingPrice: product.originalSellingPrice,
            originalSellingPrice: null, // Clear the original price field
          },
        });
      }
    }
  } catch (error) {
  }
}
