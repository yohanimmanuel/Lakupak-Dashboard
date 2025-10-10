import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

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
    const where: any = {
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
    const transformedOffers = offers.map((offer: any) => ({
      id: offer.id,
      offerId: offer.offerId,
      name: offer.name,
      description: offer.description,
      type: offer.type,
      status: offer.status,
      discountTypes: offer.offerDiscountTypes.map((dt: any) => ({
        id: dt.id,
        discountType: dt.discountType,
        discountValue: dt.discountValue,
        name: dt.name,
        description: dt.description,
        minOrderValue: dt.minOrderValue,
        minQuantity: dt.minQuantity,
        maxUsage: dt.maxUsage,
        perCustomerLimit: dt.perCustomerLimit,
        isActive: dt.isActive,
        priority: dt.priority,
      })),
      startDate: offer.startDate,
      endDate: offer.endDate,
      totalUsage: offer.totalUsage,
      totalDiscountGiven: offer.totalDiscountGiven,
      products: offer.offerProducts.map((op: any) => ({
        id: op.id,
        productId: op.product.productId,
        name: op.product.name,
        productType: op.product.productType,
        productCategory: op.product.productCategory,
        sellingPrice: op.product.sellingPrice,
      })),
      dateRanges: offer.dateRanges?.map((dr: any) => ({
        id: dr.id,
        name: dr.name,
        description: dr.description,
        startDate: dr.startDate,
        endDate: dr.endDate,
        isActive: dr.isActive,
      })) || [],
      timeSlots: offer.timeSlots?.map((ts: any) => ({
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

// POST /api/offers - Create a new offer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
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
    const result = await prisma.$transaction(async (tx: any) => {
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
        data: discountTypes.map((dt: any) => ({
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
          perCustomerLimit: dt.perCustomerLimit,
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
          data: dateRanges.map((dr: any) => ({
            offerId: offer.id,
            name: dr.name,
            description: dr.description,
            startDate: new Date(dr.startDate),
            endDate: new Date(dr.endDate),
            isActive: dr.isActive ?? true,
          })),
        });
      }

      // Create time slots
      if (timeSlots.length > 0) {
        await tx.timeSlot.createMany({
          data: timeSlots.map((ts: any) => ({
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
      discountTypes: createdOffer!.offerDiscountTypes.map((dt: any) => ({
        id: dt.id,
        discountType: dt.discountType,
        discountValue: dt.discountValue,
        name: dt.name,
        description: dt.description,
        minOrderValue: dt.minOrderValue,
        minQuantity: dt.minQuantity,
        maxUsage: dt.maxUsage,
        perCustomerLimit: dt.perCustomerLimit,
        isActive: dt.isActive,
        priority: dt.priority,
      })),
      startDate: createdOffer!.startDate,
      endDate: createdOffer!.endDate,
      totalUsage: createdOffer!.totalUsage,
      totalDiscountGiven: createdOffer!.totalDiscountGiven,
      products: createdOffer!.offerProducts.map((op: any) => ({
        id: op.id,
        productId: op.product.productId,
        name: op.product.name,
        productType: op.product.productType,
        productCategory: op.product.productCategory,
        sellingPrice: op.product.sellingPrice,
      })),
      dateRanges: createdOffer!.dateRanges?.map((dr: any) => ({
        id: dr.id,
        name: dr.name,
        description: dr.description,
        startDate: dr.startDate,
        endDate: dr.endDate,
        isActive: dr.isActive,
      })) || [],
      timeSlots: createdOffer!.timeSlots?.map((ts: any) => ({
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
