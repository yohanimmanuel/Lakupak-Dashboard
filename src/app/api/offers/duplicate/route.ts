import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// POST /api/offers/duplicate - Duplicate an existing offer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { offerId, userId } = body;
    
    if (!offerId || !userId) {
      return NextResponse.json({ error: 'Missing offerId or userId parameter' }, { status: 400 });
    }
    
    // Validate userId format
    if (!/^\d+$/.test(String(userId))) {
      return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 });
    }
    
    const user = { id: parseInt(userId) };
    
    // Fetch the original offer with all relations
    const originalOffer = await prisma.offer.findFirst({
      where: {
        id: offerId,
        userId: user.id
      },
      include: {
        offerProducts: {
          include: {
            product: {
              select: {
                productId: true,
                name: true
              }
            }
          }
        },
        offerDiscountTypes: true,
        dateRanges: true,
        timeSlots: true
      }
    });
    
    if (!originalOffer) {
      return NextResponse.json(
        { error: 'Offer not found or you do not have permission to duplicate it' },
        { status: 404 }
      );
    }
    
    // Generate unique offer ID for the duplicate
    const newOfferId = `OFF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create duplicate offer with all relations in a transaction
    const duplicatedOffer = await prisma.$transaction(async (tx) => {
      // Create the duplicated offer
      const newOffer = await tx.offer.create({
        data: {
          offerId: newOfferId,
          name: `${originalOffer.name} (Copy)`,
          description: originalOffer.description,
          type: originalOffer.type,
          status: 'inactive', // Start as inactive to allow configuration
          startDate: originalOffer.startDate,
          endDate: originalOffer.endDate,
          userId: user.id
        }
      });
      
      // Duplicate discount types
      if (originalOffer.offerDiscountTypes.length > 0) {
        await tx.offerDiscountType.createMany({
          data: originalOffer.offerDiscountTypes.map(dt => ({
            offerId: newOffer.id,
            discountType: dt.discountType,
            discountValue: dt.discountValue,
            name: dt.name,
            description: dt.description,
            minOrderValue: dt.minOrderValue,
            minQuantity: dt.minQuantity,
            maxUsage: dt.maxUsage,
            perCustomerLimit: dt.perCustomerLimit,
            isActive: dt.isActive,
            priority: dt.priority
          }))
        });
      }
      
      // Duplicate offer-product relationships
      if (originalOffer.offerProducts.length > 0) {
        await tx.offerProduct.createMany({
          data: originalOffer.offerProducts.map(op => ({
            offerId: newOffer.id,
            productId: op.productId
          }))
        });
      }
      
      // Duplicate date ranges
      if (originalOffer.dateRanges && originalOffer.dateRanges.length > 0) {
        await tx.dateRange.createMany({
          data: originalOffer.dateRanges.map(dr => ({
            offerId: newOffer.id,
            name: dr.name,
            description: dr.description,
            startDate: dr.startDate,
            endDate: dr.endDate,
            isActive: dr.isActive
          }))
        });
      }
      
      // Duplicate time slots
      if (originalOffer.timeSlots && originalOffer.timeSlots.length > 0) {
        await tx.timeSlot.createMany({
          data: originalOffer.timeSlots.map(ts => ({
            offerId: newOffer.id,
            name: ts.name,
            description: ts.description,
            startTime: ts.startTime,
            endTime: ts.endTime,
            days: ts.days,
            isActive: ts.isActive
          }))
        });
      }
      
      return newOffer;
    });
    
    // Fetch the created offer with all relations
    const createdOffer = await prisma.offer.findUnique({
      where: { id: duplicatedOffer.id },
      include: {
        offerProducts: {
          include: {
            product: {
              select: {
                productId: true,
                name: true,
                productType: true,
                productCategory: true,
                sellingPrice: true
              }
            }
          }
        },
        offerDiscountTypes: true,
        dateRanges: true,
        timeSlots: true
      }
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
        perCustomerLimit: dt.perCustomerLimit,
        isActive: dt.isActive,
        priority: dt.priority
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
        sellingPrice: op.product.sellingPrice
      })),
      dateRanges: createdOffer!.dateRanges?.map((dr) => ({
        id: dr.id,
        name: dr.name,
        description: dr.description,
        startDate: dr.startDate,
        endDate: dr.endDate,
        isActive: dr.isActive
      })) || [],
      timeSlots: createdOffer!.timeSlots?.map((ts) => ({
        id: ts.id,
        name: ts.name,
        description: ts.description,
        startTime: ts.startTime,
        endTime: ts.endTime,
        days: ts.days,
        isActive: ts.isActive
      })) || [],
      createdAt: createdOffer!.createdAt,
      updatedAt: createdOffer!.updatedAt
    };
    
    return NextResponse.json({
      message: 'Offer duplicated successfully',
      offer: transformedOffer
    }, { status: 201 });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to duplicate offer', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

