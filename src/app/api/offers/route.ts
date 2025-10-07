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
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = session.user as ExtendedUser;
    if (!user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
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
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      minOrderValue: offer.minOrderValue?.toString(),
      minQuantity: offer.minQuantity,
      startDate: offer.startDate,
      endDate: offer.endDate,
      maxUsage: offer.maxUsage,
      perCustomerLimit: offer.perCustomerLimit,
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
    console.error('Error fetching offers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch offers' },
      { status: 500 }
    );
  }
}

// POST /api/offers - Create a new offer
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = session.user as ExtendedUser;
    if (!user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      description,
      type,
      discountType,
      discountValue,
      minOrderValue,
      minQuantity,
      startDate,
      endDate,
      maxUsage,
      perCustomerLimit,
      productIds,
    } = body;

    // Validate required fields
    if (!name || !type || !discountType || !discountValue || !startDate || !endDate || !productIds?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate date range
          const start = new Date(startDate);
          const end = new Date(endDate);
          
          // Parse minOrderValue from string to number
          const parsedMinOrderValue = minOrderValue ? parseFloat(minOrderValue.replace(/[^\d.-]/g, '')) : undefined;
    if (start >= end) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }

    // Validate discount value
    if (discountValue <= 0) {
      return NextResponse.json(
        { error: 'Discount value must be greater than 0' },
        { status: 400 }
      );
    }

    // Validate discount type and value combination
    if (discountType === 'percentage' && discountValue > 100) {
      return NextResponse.json(
        { error: 'Percentage discount cannot exceed 100%' },
        { status: 400 }
      );
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
          status: 'active',
          discountType,
          discountValue,
          minOrderValue: parsedMinOrderValue,
          minQuantity,
          startDate: start,
          endDate: end,
          maxUsage,
          perCustomerLimit,
          userId: user.id,
        },
      });

      // Create offer-product relationships
      const offerProducts = await tx.offerProduct.createMany({
        data: productIds.map((productId: string) => ({
          offerId: offer.id,
          productId,
        })),
      });

      return { offer, offerProducts };
    });

    // Fetch the created offer with products
    const createdOffer = await prisma.offer.findUnique({
      where: { id: result.offer.id },
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
      discountType: createdOffer!.discountType,
      discountValue: createdOffer!.discountValue,
      minOrderValue: createdOffer!.minOrderValue?.toString(),
      minQuantity: createdOffer!.minQuantity,
      startDate: createdOffer!.startDate,
      endDate: createdOffer!.endDate,
      maxUsage: createdOffer!.maxUsage,
      perCustomerLimit: createdOffer!.perCustomerLimit,
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
      createdAt: createdOffer!.createdAt,
      updatedAt: createdOffer!.updatedAt,
    };

    return NextResponse.json(transformedOffer, { status: 201 });

  } catch (error) {
    console.error('Error creating offer:', error);
    return NextResponse.json(
      { error: 'Failed to create offer' },
      { status: 500 }
    );
  }
}
