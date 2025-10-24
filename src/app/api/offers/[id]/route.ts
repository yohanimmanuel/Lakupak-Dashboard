import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { parseNumberByCurrency, formatNumberByCurrency } from '@/config/currencyConfig';
import type {
  DiscountTypeInput,
  DiscountTypeUpdate,
  DateRangeInput,
  DateRangeUpdate,
  TimeSlotInput,
  TimeSlotUpdate,
  ProductInput,
  OfferUpdateInput,
  BatchOfferUpdate,
  RemoveProductsInput,
  AddProductsInput,
  OfferDiscountTypeResult,
  OfferProductResult,
  DateRangeResult,
  TimeSlotResult,
  OfferWithRelations,
} from '@/types/offer-api';
import type { Prisma } from '@prisma/client';

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
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const offerId = id;
    const user = { id: parseInt(userId) };

    const offer = await prisma.offer.findFirst({
      where: {
        id: offerId,
        userId: user.id,
      },
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
      products: offer.offerProducts.map((op) => {
        const firstVariant = op.product.variants?.[0];
        return {
          id: op.id,
          productId: op.product.productId,
          name: op.product.name,
          brand: op.product.brand,
          type: op.product.productType,
          category: op.product.productCategory,
          price: firstVariant?.sellingPrice || '0',
          status: op.product.status,
          stock: firstVariant?.stockQuantity || 0,
          // Add variant information for piece-based pricing
          variantName: firstVariant?.variantName || 'Single Piece',
          packageType: firstVariant?.packageType || 'Piece',
          piecesPerPackage: firstVariant?.piecesPerPackage || 1,
          // Calculate piece price (price per individual piece)
          piecePrice: firstVariant ? 
            (parseFloat(firstVariant.sellingPrice || '0') / (firstVariant.piecesPerPackage || 1)) : 0
        };
      }),
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
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const user = { id: parseInt(userId) };
    const type = searchParams.get('type'); // 'discount-type', 'date-range', 'time-slot', or 'offer'
    const itemId = searchParams.get('itemId'); // For specific items like discount-type-123

    const body = await request.json();

    if (type === 'discount-type') {
      if (itemId) {
        // Update a specific discount type
        return await updateDiscountType(itemId, user.id, body);
      } else {
        // Create a new discount type
        return await createDiscountType(id, user.id, body);
      }
    } else if (type === 'date-range') {
      if (itemId) {
        // Update a specific date range
        return await updateDateRange(itemId, user.id, body);
      } else {
        // Create a new date range
        return await createDateRange(id, user.id, body);
      }
    } else if (type === 'time-slot') {
      if (itemId) {
        // Update a specific time slot
        return await updateTimeSlot(itemId, user.id, body);
      } else {
        // Create a new time slot
        return await createTimeSlot(id, user.id, body);
      }
    } else if (type === 'offer') {
      // Update the main offer
      return await updateOffer(id, user.id, body);
    } else if (type === 'remove-products') {
      // Remove products from offer
      return await removeProductsFromOffer(id, user.id, body);
    } else if (type === 'add-products') {
      // Add products to offer
      return await addProductsToOffer(id, user.id, body);
    } else if (type === 'batch-update') {
      // Batch update all offer data at once
      return await batchUpdateOffer(id, user.id, body);
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
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const user = { id: parseInt(userId) };
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
      return await deleteOffer(id, user.id);
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
async function updateDiscountType(discountTypeId: string, userId: number, data: DiscountTypeUpdate) {
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

  // Check if maxUsage is being changed
  const maxUsageChanged = existingDiscountType.maxUsage !== data.maxUsage;
  
  // Use transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Update the discount type
    const updatedDiscountType = await tx.offerDiscountType.update({
      where: { id: discountTypeId },
      data: {
        name: data.name,
        description: data.description,
        minOrderValue: data.minOrderValue ? 
          (typeof data.minOrderValue === 'string' ? parseFloat(data.minOrderValue.replace(/\./g, '')) : data.minOrderValue) : 
          null,
        minQuantity: data.minQuantity,
        maxUsage: data.maxUsage,
        isActive: data.isActive,
      },
    });

    // If maxUsage changed, reset the usage tracking for this discount type
    if (maxUsageChanged) {
      await tx.offerUsageTracking.deleteMany({
        where: {
          discountTypeId: discountTypeId,
        },
      });
    }

    return updatedDiscountType;
  });

  // IMPORTANT: Update product prices after discount type status change
  // This ensures prices revert to original when discount types are deactivated
  await prisma.$transaction(async (tx) => {
    await resetProductPricesFromOffers(tx, userId);
    await updateProductPricesFromOffers(tx, userId);
  });

  // Note: We don't auto-deactivate offers when discount types are deactivated
  // Users should manually control offer status - they might want to keep offers active
  // for promotions (buy_x_get_y) even when price discounts are deactivated

  // Update lastSyncAt for marketplace sync
  await prisma.product.updateMany({
    where: {
      userId: userId,
      offerProducts: {
        some: {
          offer: {
            offerDiscountTypes: {
              some: {
                id: discountTypeId
              }
            }
          }
        }
      }
    },
    data: {
      lastSyncAt: new Date()
    }
  });

  return NextResponse.json({
    message: maxUsageChanged ? 'Discount type updated successfully and usage reset' : 'Discount type updated successfully',
    discountType: result,
    usageReset: maxUsageChanged,
  });
}

async function updateDateRange(dateRangeId: string, userId: number, data: DateRangeUpdate) {
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
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      isActive: data.isActive,
    },
  });

  return NextResponse.json({
    message: 'Date range updated successfully',
    dateRange: updatedDateRange,
  });
}

async function updateTimeSlot(timeSlotId: string, userId: number, data: TimeSlotUpdate) {
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
      days: (data.days as unknown) as string[],
      isActive: data.isActive,
    },
  });

  return NextResponse.json({
    message: 'Time slot updated successfully',
    timeSlot: updatedTimeSlot,
  });
}

async function updateOffer(offerId: string, userId: number, data: OfferUpdateInput) {
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
      type: (data.type as unknown) as string[],
      status: data.status,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    },
  });

  // IMPORTANT: Update product prices after offer status change
  // This ensures prices revert to original when offers are deactivated
  await prisma.$transaction(async (tx) => {
    await resetProductPricesFromOffers(tx, userId);
    await updateProductPricesFromOffers(tx, userId);
  });

  // Update lastSyncAt for marketplace sync
  await prisma.product.updateMany({
    where: {
      userId: userId,
      offerProducts: {
        some: {
          offerId: offerId
        }
      }
    },
    data: {
      lastSyncAt: new Date()
    }
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

  // IMPORTANT: Update product prices after discount type deletion
  // This ensures prices revert to original when discount types are removed
  await prisma.$transaction(async (tx) => {
    await resetProductPricesFromOffers(tx, userId);
    await updateProductPricesFromOffers(tx, userId);
  });

  // Update lastSyncAt for marketplace sync
  await prisma.product.updateMany({
    where: {
      userId: userId,
      offerProducts: {
        some: {
          offer: {
            offerDiscountTypes: {
              some: {
                id: discountTypeId
              }
            }
          }
        }
      }
    },
    data: {
      lastSyncAt: new Date()
    }
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

  // Update product prices after deleting the offer
  await prisma.$transaction(async (tx) => {
    await resetProductPricesFromOffers(tx, userId);
    await updateProductPricesFromOffers(tx, userId);
  });

  return NextResponse.json({ message: 'Offer deleted successfully' });
}

async function removeProductsFromOffer(offerId: string, userId: number, data: RemoveProductsInput) {
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

// Helper function to create a new discount type for an existing offer
async function createDiscountType(offerId: string, userId: number, data: DiscountTypeInput) {
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

  // Parse minOrderValue if it's a string
  let parsedMinOrderValue: number = 0;
  if (typeof data.minOrderValue === 'string' && data.minOrderValue) {
    parsedMinOrderValue = parseFloat(data.minOrderValue.replace(/\./g, ''));
  } else if (typeof data.minOrderValue === 'number') {
    parsedMinOrderValue = data.minOrderValue;
  }

  // Create the discount type
  const discountType = await prisma.offerDiscountType.create({
    data: {
      offerId: offerId,
      name: data.name || '',
      description: data.description || '',
      discountType: data.discountType || '',
      discountValue: data.discountValue || 0,
      minOrderValue: parsedMinOrderValue,
      minQuantity: data.minQuantity || 0,
      maxUsage: data.maxUsage || 0,
      isActive: data.isActive ?? true,
      priority: data.priority || 1,
    },
  });

  return NextResponse.json({ discountType, message: 'Discount type created successfully' });
}

// Helper function to create a new date range for an existing offer
async function createDateRange(offerId: string, userId: number, data: DateRangeInput) {
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

  // Create the date range
  const dateRange = await prisma.dateRange.create({
    data: {
      offerId: offerId,
      name: data.name || '',
      description: data.description,
      startDate: data.startDate ? new Date(data.startDate) : new Date(),
      endDate: data.endDate ? new Date(data.endDate) : new Date(),
      isActive: data.isActive ?? true,
    },
  });

  return NextResponse.json({ dateRange, message: 'Date range created successfully' });
}

// Helper function to create a new time slot for an existing offer
async function createTimeSlot(offerId: string, userId: number, data: TimeSlotInput) {
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

  // Create the time slot
  const timeSlot = await prisma.timeSlot.create({
    data: {
      offerId: offerId,
      name: data.name || '',
      description: data.description,
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      days: (data.days as unknown) as string[],
      isActive: data.isActive ?? true,
    },
  });

  return NextResponse.json({ timeSlot, message: 'Time slot created successfully' });
}

// Helper function to add products to an existing offer
async function addProductsToOffer(offerId: string, userId: number, data: AddProductsInput) {
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

  const { productIds } = data; // Array of product IDs to add

  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json(
      { error: 'No product IDs provided' },
      { status: 400 }
    );
  }

  // Create OfferProduct records for each product
  const offerProducts = await prisma.offerProduct.createMany({
    data: productIds.map((productId: string) => ({
      offerId: offerId,
      productId: productId,
    })),
    skipDuplicates: true, // Skip if already exists
  });

  return NextResponse.json({ message: 'Products added to offer successfully', count: offerProducts.count });
}

// Helper function to batch update all offer data at once
async function batchUpdateOffer(offerId: string, userId: number, data: BatchOfferUpdate) {
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

  const { discountTypes, dateRanges, timeSlots, products, status } = data;

  try {
    // Determine offer types based on discount types
    let offerTypes: string[] = [];
    if (discountTypes && discountTypes.length > 0) {
      const activeDiscountTypes = discountTypes.filter((dt) => dt.isActive !== false);
      
      if (activeDiscountTypes.some((dt) => dt.discountType === 'percentage' || dt.discountType === 'fixed')) {
        offerTypes.push('discount');
      }
      if (activeDiscountTypes.some((dt) => dt.discountType === 'buy_x_get_y')) {
        offerTypes.push('promotion');
      }
      
      // Fallback to existing type if no types determined
      if (offerTypes.length === 0) {
        offerTypes = existingOffer.type || ['discount'];
      }
    } else {
      // Keep existing type if no discount types provided
      offerTypes = existingOffer.type || ['discount'];
    }

    // Use a transaction to update all data atomically
    await prisma.$transaction(async (tx) => {
      // 0. Determine if offer should be active based on discount types
      // Use the provided status or keep existing status
      // Don't auto-deactivate offers based on discount types - users should control this manually
      let finalStatus = status || existingOffer.status;

      // Update the offer's type and status fields
      await tx.offer.update({
        where: { id: offerId },
        data: { 
          type: offerTypes,
          status: finalStatus
        },
      });

      // 1. Update discount types
      if (discountTypes) {
        // Delete existing discount types
        await tx.offerDiscountType.deleteMany({
          where: { offerId },
        });
        
        // Create new discount types
        if (discountTypes.length > 0) {
          await tx.offerDiscountType.createMany({
            data: discountTypes.map((dt) => ({
              offerId,
              discountType: dt.discountType || 'percentage',
              discountValue: dt.discountValue || 0,
              name: dt.name || '',
              description: dt.description || '',
              minOrderValue: dt.minOrderValue ? (typeof dt.minOrderValue === 'string' ? parseFloat(dt.minOrderValue.replace(/\./g, '')) : dt.minOrderValue) : null,
              minQuantity: dt.minQuantity,
              maxUsage: dt.maxUsage,
              isActive: dt.isActive ?? true,
              priority: dt.priority ?? 1,
            })),
          });
        }
      }

      // 2. Update date ranges
      if (dateRanges) {
        // Delete existing date ranges
        await tx.dateRange.deleteMany({
          where: { offerId },
        });
        
        // Create new date ranges
        if (dateRanges.length > 0) {
          await tx.dateRange.createMany({
            data: dateRanges.map((dr) => ({
              offerId,
              name: dr.name || '',
              description: dr.description || '',
              startDate: dr.startDate ? new Date(dr.startDate) : new Date(),
              endDate: dr.endDate ? new Date(dr.endDate) : new Date(),
              isActive: dr.isActive ?? true,
            })),
          });
        }
      }

      // 3. Update time slots
      if (timeSlots) {
        // Delete existing time slots
        await tx.timeSlot.deleteMany({
          where: { offerId },
        });
        
        // Create new time slots
        if (timeSlots.length > 0) {
          await tx.timeSlot.createMany({
            data: timeSlots.map((ts) => ({
              offerId,
              name: ts.name || '',
              description: ts.description || '',
              startTime: ts.startTime || '00:00',
              endTime: ts.endTime || '23:59',
              days: (typeof ts.days === 'string' ? [ts.days] : ts.days) || [],
              isActive: ts.isActive ?? true,
            })),
          });
        }
      }

      // 4. Update products
      if (products) {
        // Delete existing offer products
        await tx.offerProduct.deleteMany({
          where: { offerId },
        });
        
        // Create new offer products
        if (products.length > 0) {
          await tx.offerProduct.createMany({
            data: products.map((p) => ({
              offerId,
              productId: p.productId,
            })),
            skipDuplicates: true,
          });
        }
      }

      // 5. Update product prices based on active offers
      await resetProductPricesFromOffers(tx, userId);
      await updateProductPricesFromOffers(tx, userId);
    });

    // IMPORTANT: Also update prices outside the transaction to ensure it runs
    // This handles cases where the transaction might not trigger the price update properly
    try {
      // Small delay to ensure database changes are committed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Run price recalculation multiple times to ensure it works
      await prisma.$transaction(async (tx) => {
        await resetProductPricesFromOffers(tx, userId);
        await updateProductPricesFromOffers(tx, userId);
      });
      
      // Additional delay and retry for stubborn cases
      await new Promise(resolve => setTimeout(resolve, 200));
      await prisma.$transaction(async (tx) => {
        await resetProductPricesFromOffers(tx, userId);
        await updateProductPricesFromOffers(tx, userId);
      });
      
    } catch (priceUpdateError) {
      // Log the error but don't fail the entire operation
      // Error handled silently
    }

    return NextResponse.json({ 
      message: 'Offer updated successfully',
      priceUpdateTriggered: true 
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to batch update offer', details: error instanceof Error ? error.message : String(error) },
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
            originalSellingPrice: hasOffer ? String(Math.round(originalPrice)) : variant.originalSellingPrice
          }
        });
      }
    }
  } catch (error) {
    console.error('Error updating product prices from offers:', error);
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

    // Reset prices for products that no longer have active offers
    for (const product of productsWithOriginalPrices) {
      // Skip if product still has active offers
      if (productsWithActiveOffers.has(product.productId)) {
        continue;
      }

      for (const variant of product.variants) {
        if (variant.originalSellingPrice) {
          // Reset selling price to original price and clear originalSellingPrice
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
  } catch (error) {
    console.error('Error resetting product prices from offers:', error);
  }
}