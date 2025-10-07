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

// GET /api/offers/[id] - Get a specific offer
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = session.user as ExtendedUser;
    if (!user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const offer = await prisma.offer.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
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

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    // Transform the response
    const transformedOffer = {
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
    };

    return NextResponse.json(transformedOffer);

  } catch (error) {
    console.error('Error fetching offer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch offer' },
      { status: 500 }
    );
  }
}

// PUT /api/offers/[id] - Update a specific offer
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      status,
    } = body;

    // Check if offer exists and belongs to user
    const existingOffer = await prisma.offer.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    });

    if (!existingOffer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    // Validate required fields if provided
    if (name !== undefined && !name.trim()) {
      return NextResponse.json(
        { error: 'Name cannot be empty' },
        { status: 400 }
      );
    }

    if (discountValue !== undefined && discountValue <= 0) {
      return NextResponse.json(
        { error: 'Discount value must be greater than 0' },
        { status: 400 }
      );
    }

    // Parse minOrderValue from string to number
    const parsedMinOrderValue = minOrderValue ? parseFloat(minOrderValue.replace(/[^\d.-]/g, '')) : undefined;

    if (discountType === 'percentage' && discountValue > 100) {
      return NextResponse.json(
        { error: 'Percentage discount cannot exceed 100%' },
        { status: 400 }
      );
    }

    // Validate date range if dates are provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start >= end) {
        return NextResponse.json(
          { error: 'End date must be after start date' },
          { status: 400 }
        );
      }
    }

    // Validate products if productIds are provided
    if (productIds && productIds.length > 0) {
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
    }

    // Update offer and products in a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // Prepare update data
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;
      if (status !== undefined) updateData.status = status;
      if (discountType !== undefined) updateData.discountType = discountType;
      if (discountValue !== undefined) updateData.discountValue = discountValue;
      if (minOrderValue !== undefined) updateData.minOrderValue = parsedMinOrderValue;
      if (minQuantity !== undefined) updateData.minQuantity = minQuantity;
      if (startDate !== undefined) updateData.startDate = new Date(startDate);
      if (endDate !== undefined) updateData.endDate = new Date(endDate);
      if (maxUsage !== undefined) updateData.maxUsage = maxUsage;
      if (perCustomerLimit !== undefined) updateData.perCustomerLimit = perCustomerLimit;

      // Update the offer
      const offer = await tx.offer.update({
        where: { id: params.id },
        data: updateData,
      });

      // Update products if provided
      if (productIds !== undefined) {
        // Delete existing offer-product relationships
        await tx.offerProduct.deleteMany({
          where: { offerId: params.id },
        });

        // Create new offer-product relationships
        if (productIds.length > 0) {
          await tx.offerProduct.createMany({
            data: productIds.map((productId: string) => ({
              offerId: params.id,
              productId,
            })),
          });
        }
      }

      return offer;
    });

    // Fetch the updated offer with products
    const updatedOffer = await prisma.offer.findUnique({
      where: { id: params.id },
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
      id: updatedOffer!.id,
      offerId: updatedOffer!.offerId,
      name: updatedOffer!.name,
      description: updatedOffer!.description,
      type: updatedOffer!.type,
      status: updatedOffer!.status,
      discountType: updatedOffer!.discountType,
      discountValue: updatedOffer!.discountValue,
      minOrderValue: updatedOffer!.minOrderValue?.toString(),
      minQuantity: updatedOffer!.minQuantity,
      startDate: updatedOffer!.startDate,
      endDate: updatedOffer!.endDate,
      maxUsage: updatedOffer!.maxUsage,
      perCustomerLimit: updatedOffer!.perCustomerLimit,
      totalUsage: updatedOffer!.totalUsage,
      totalDiscountGiven: updatedOffer!.totalDiscountGiven,
      products: updatedOffer!.offerProducts.map((op: any) => ({
        id: op.id,
        productId: op.product.productId,
        name: op.product.name,
        productType: op.product.productType,
        productCategory: op.product.productCategory,
        sellingPrice: op.product.sellingPrice,
      })),
      createdAt: updatedOffer!.createdAt,
      updatedAt: updatedOffer!.updatedAt,
    };

    return NextResponse.json(transformedOffer);

  } catch (error) {
    console.error('Error updating offer:', error);
    return NextResponse.json(
      { error: 'Failed to update offer' },
      { status: 500 }
    );
  }
}

// DELETE /api/offers/[id] - Delete a specific offer
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = session.user as ExtendedUser;
    if (!user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if offer exists and belongs to user
    const existingOffer = await prisma.offer.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    });

    if (!existingOffer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    // Delete offer (cascade will delete offer-products)
    await prisma.offer.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: 'Offer deleted successfully' });

  } catch (error) {
    console.error('Error deleting offer:', error);
    return NextResponse.json(
      { error: 'Failed to delete offer' },
      { status: 500 }
    );
  }
}
