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

    const offerId = params.id;

    const offer = await prisma.offer.findFirst({
      where: {
        id: offerId,
        userId: user.id,
      },
      include: {
        offerProducts: {
          include: {
            product: {
              select: {
                productId: true,
                name: true,
                brand: true,
                productType: true,
                productCategory: true,
                sellingPrice: true,
                status: true,
                stockQuantity: true,
              },
            },
          },
        },
        offerDiscountTypes: true,
        dateRanges: true,
        timeSlots: true,
      },
    });

    if (!offer) {
      return NextResponse.json(
        { error: 'Offer not found or you do not have permission to view it' },
        { status: 404 }
      );
    }

    // Transform the response to match frontend expectations
    const transformedOffer = {
      id: offer.id,
      offerId: offer.offerId,
      name: offer.name,
      description: offer.description,
      type: offer.type,
      status: offer.status,
      startDate: offer.startDate,
      endDate: offer.endDate,
      totalUsage: offer.totalUsage,
      totalDiscountGiven: offer.totalDiscountGiven,
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
      products: offer.offerProducts.map((op: any) => ({
        id: op.id,
        productId: op.product.productId,
        name: op.product.name,
        brand: op.product.brand,
        type: op.product.productType,
        category: op.product.productCategory,
        price: op.product.sellingPrice,
        status: op.product.status,
        stock: op.product.stockQuantity,
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
        isActive: ts.isActive,
      })) || [],
    };

    return NextResponse.json({ offer: transformedOffer });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch offer' },
      { status: 500 }
    );
  }
}

// PUT /api/offers/[id] - Update offer, discount types, date ranges, or time slots
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'discount-type', 'date-range', 'time-slot', or 'offer'
    const itemId = searchParams.get('itemId'); // For specific items like discount-type-123

    const body = await request.json();

    if (type === 'discount-type' && itemId) {
      // Update a specific discount type
      return await updateDiscountType(itemId, user.id, body);
    } else if (type === 'date-range' && itemId) {
      // Update a specific date range
      return await updateDateRange(itemId, user.id, body);
    } else if (type === 'time-slot' && itemId) {
      // Update a specific time slot
      return await updateTimeSlot(itemId, user.id, body);
    } else if (type === 'offer') {
      // Update the main offer
      return await updateOffer(params.id, user.id, body);
    } else if (type === 'remove-products') {
      // Remove products from offer
      return await removeProductsFromOffer(params.id, user.id, body);
    } else {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update' },
      { status: 500 }
    );
  }
}

// DELETE /api/offers/[id] - Delete offer, discount types, date ranges, or time slots
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'discount-type', 'date-range', 'time-slot', or 'offer'
    const itemId = searchParams.get('itemId'); // For specific items like discount-type-123

    if (type === 'discount-type' && itemId) {
      // Delete a specific discount type
      return await deleteDiscountType(itemId, user.id);
    } else if (type === 'date-range' && itemId) {
      // Delete a specific date range
      return await deleteDateRange(itemId, user.id);
    } else if (type === 'time-slot' && itemId) {
      // Delete a specific time slot
      return await deleteTimeSlot(itemId, user.id);
    } else if (type === 'offer' || !type) {
      // Delete the main offer
      return await deleteOffer(params.id, user.id);
    } else {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      );
    }

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete' },
      { status: 500 }
    );
  }
}

// Helper functions for different operations
async function updateDiscountType(discountTypeId: string, userId: number, data: any) {
  // Check if discount type exists and belongs to user's offer
  const existingDiscountType = await prisma.offerDiscountType.findFirst({
    where: {
      id: discountTypeId,
      offer: {
        userId: userId,
      },
    },
  });

  if (!existingDiscountType) {
    return NextResponse.json(
      { error: 'Discount type not found or you do not have permission to edit it' },
      { status: 404 }
    );
  }

  // Update the discount type
  const updatedDiscountType = await prisma.offerDiscountType.update({
    where: { id: discountTypeId },
    data: {
      name: data.name,
      description: data.description,
      minOrderValue: data.minOrderValue ? 
        (typeof data.minOrderValue === 'string' ? parseFloat(data.minOrderValue.replace(/\./g, '')) : data.minOrderValue) : 
        null,
      minQuantity: data.minQuantity,
      maxUsage: data.maxUsage,
      perCustomerLimit: data.perCustomerLimit,
      isActive: data.isActive,
    },
  });

  return NextResponse.json({
    message: 'Discount type updated successfully',
    discountType: updatedDiscountType,
  });
}

async function updateDateRange(dateRangeId: string, userId: number, data: any) {
  // Check if date range exists and belongs to user's offer
  const existingDateRange = await prisma.dateRange.findFirst({
    where: {
      id: dateRangeId,
      offer: {
        userId: userId,
      },
    },
  });

  if (!existingDateRange) {
    return NextResponse.json(
      { error: 'Date range not found or you do not have permission to edit it' },
      { status: 404 }
    );
  }

  // Update the date range
  const updatedDateRange = await prisma.dateRange.update({
    where: { id: dateRangeId },
    data: {
      name: data.name,
      description: data.description,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isActive: data.isActive,
    },
  });

  return NextResponse.json({
    message: 'Date range updated successfully',
    dateRange: updatedDateRange,
  });
}

async function updateTimeSlot(timeSlotId: string, userId: number, data: any) {
  // Check if time slot exists and belongs to user's offer
  const existingTimeSlot = await prisma.timeSlot.findFirst({
    where: {
      id: timeSlotId,
      offer: {
        userId: userId,
      },
    },
  });

  if (!existingTimeSlot) {
    return NextResponse.json(
      { error: 'Time slot not found or you do not have permission to edit it' },
      { status: 404 }
    );
  }

  // Update the time slot
  const updatedTimeSlot = await prisma.timeSlot.update({
    where: { id: timeSlotId },
    data: {
      name: data.name,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      isActive: data.isActive,
    },
  });

  return NextResponse.json({
    message: 'Time slot updated successfully',
    timeSlot: updatedTimeSlot,
  });
}

async function updateOffer(offerId: string, userId: number, data: any) {
  // Check if offer exists and belongs to user
  const existingOffer = await prisma.offer.findFirst({
    where: {
      id: offerId,
      userId: userId,
    },
  });

  if (!existingOffer) {
    return NextResponse.json(
      { error: 'Offer not found or you do not have permission to edit it' },
      { status: 404 }
    );
  }

  // Update the offer
  const updatedOffer = await prisma.offer.update({
    where: { id: offerId },
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      status: data.status,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    },
  });

  return NextResponse.json({
    message: 'Offer updated successfully',
    offer: updatedOffer,
  });
}

async function deleteDiscountType(discountTypeId: string, userId: number) {
  // Check if discount type exists and belongs to user's offer
  const existingDiscountType = await prisma.offerDiscountType.findFirst({
    where: {
      id: discountTypeId,
      offer: {
        userId: userId,
      },
    },
  });

  if (!existingDiscountType) {
    return NextResponse.json(
      { error: 'Discount type not found or you do not have permission to delete it' },
      { status: 404 }
    );
  }

  // Delete the discount type
  await prisma.offerDiscountType.delete({
    where: { id: discountTypeId },
  });

  return NextResponse.json({ message: 'Discount type deleted successfully' });
}

async function deleteDateRange(dateRangeId: string, userId: number) {
  // Check if date range exists and belongs to user's offer
  const existingDateRange = await prisma.dateRange.findFirst({
    where: {
      id: dateRangeId,
      offer: {
        userId: userId,
      },
    },
  });

  if (!existingDateRange) {
    return NextResponse.json(
      { error: 'Date range not found or you do not have permission to delete it' },
      { status: 404 }
    );
  }

  // Delete the date range
  await prisma.dateRange.delete({
    where: { id: dateRangeId },
  });

  return NextResponse.json({ message: 'Date range deleted successfully' });
}

async function deleteTimeSlot(timeSlotId: string, userId: number) {
  // Check if time slot exists and belongs to user's offer
  const existingTimeSlot = await prisma.timeSlot.findFirst({
    where: {
      id: timeSlotId,
      offer: {
        userId: userId,
      },
    },
  });

  if (!existingTimeSlot) {
    return NextResponse.json(
      { error: 'Time slot not found or you do not have permission to delete it' },
      { status: 404 }
    );
  }

  // Delete the time slot
  await prisma.timeSlot.delete({
    where: { id: timeSlotId },
  });

  return NextResponse.json({ message: 'Time slot deleted successfully' });
}

async function deleteOffer(offerId: string, userId: number) {
  // Check if offer exists and belongs to user
  const existingOffer = await prisma.offer.findFirst({
    where: {
      id: offerId,
      userId: userId,
    },
  });

  if (!existingOffer) {
    return NextResponse.json(
      { error: 'Offer not found or you do not have permission to delete it' },
      { status: 404 }
    );
  }

  // Delete the offer (cascade will handle related records)
  await prisma.offer.delete({
    where: {
      id: offerId,
    },
  });

  return NextResponse.json({ message: 'Offer deleted successfully' });
}

async function removeProductsFromOffer(offerId: string, userId: number, data: any) {
  // Check if offer exists and belongs to user
  const existingOffer = await prisma.offer.findFirst({
    where: {
      id: offerId,
      userId: userId,
    },
  });

  if (!existingOffer) {
    return NextResponse.json(
      { error: 'Offer not found or you do not have permission to modify it' },
      { status: 404 }
    );
  }

  const { productIds } = data; // Array of product IDs to remove

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json(
      { error: 'No product IDs provided' },
      { status: 400 }
    );
  }

  // Remove the products from the offer
  await prisma.offerProduct.deleteMany({
    where: {
      offerId: offerId,
      productId: {
        in: productIds,
      },
    },
  });

  return NextResponse.json({ 
    message: `Removed ${productIds.length} products from offer successfully` 
  });
}