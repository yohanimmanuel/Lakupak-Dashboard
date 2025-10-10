import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { parseNumberByCurrency, formatNumberByCurrency } from '@/config/currencyConfig';

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
      days: data.days || [],
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

  // Update product prices after deleting the offer
  await updateProductPricesFromOffers(prisma, userId);

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

// Helper function to create a new discount type for an existing offer
async function createDiscountType(offerId: string, userId: number, data: any) {
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
  let parsedMinOrderValue = data.minOrderValue;
  if (typeof data.minOrderValue === 'string' && data.minOrderValue) {
    parsedMinOrderValue = parseFloat(data.minOrderValue.replace(/\./g, ''));
  }

  // Create the discount type
  const discountType = await prisma.offerDiscountType.create({
    data: {
      offerId: offerId,
      name: data.name,
      description: data.description || '',
      discountType: data.discountType,
      discountValue: data.discountValue || 0,
      minOrderValue: parsedMinOrderValue || 0,
      minQuantity: data.minQuantity || 0,
      maxUsage: data.maxUsage || 0,
      perCustomerLimit: data.perCustomerLimit || 0,
      isActive: data.isActive ?? true,
      priority: data.priority || 1,
    },
  });

  return NextResponse.json({ discountType, message: 'Discount type created successfully' });
}

// Helper function to create a new date range for an existing offer
async function createDateRange(offerId: string, userId: number, data: any) {
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
      name: data.name,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      isActive: data.isActive ?? true,
    },
  });

  return NextResponse.json({ dateRange, message: 'Date range created successfully' });
}

// Helper function to create a new time slot for an existing offer
async function createTimeSlot(offerId: string, userId: number, data: any) {
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
      name: data.name,
      startTime: data.startTime,
      endTime: data.endTime,
      days: data.days || [],
      isActive: data.isActive ?? true,
    },
  });

  return NextResponse.json({ timeSlot, message: 'Time slot created successfully' });
}

// Helper function to add products to an existing offer
async function addProductsToOffer(offerId: string, userId: number, data: any) {
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
async function batchUpdateOffer(offerId: string, userId: number, data: any) {
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
      const activeDiscountTypes = discountTypes.filter((dt: any) => dt.isActive !== false);
      
      if (activeDiscountTypes.some((dt: any) => dt.discountType === 'percentage' || dt.discountType === 'fixed')) {
        offerTypes.push('discount');
      }
      if (activeDiscountTypes.some((dt: any) => dt.discountType === 'buy_x_get_y')) {
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
      // 0. Update the offer's type and status fields
      await tx.offer.update({
        where: { id: offerId },
        data: { 
          type: offerTypes,
          ...(status && { status })
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
            data: discountTypes.map((dt: any) => ({
              offerId,
              discountType: dt.discountType,
              discountValue: dt.discountValue,
              name: dt.name,
              description: dt.description,
              minOrderValue: dt.minOrderValue ? (typeof dt.minOrderValue === 'string' ? parseFloat(dt.minOrderValue.replace(/\./g, '')) : dt.minOrderValue) : null,
              minQuantity: dt.minQuantity,
              maxUsage: dt.maxUsage,
              perCustomerLimit: dt.perCustomerLimit,
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
            data: dateRanges.map((dr: any) => ({
              offerId,
              name: dr.name,
              description: dr.description,
              startDate: new Date(dr.startDate),
              endDate: new Date(dr.endDate),
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
            data: timeSlots.map((ts: any) => ({
              offerId,
              name: ts.name,
              description: ts.description,
              startTime: ts.startTime,
              endTime: ts.endTime,
              days: ts.days || [],
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
            data: products.map((p: any) => ({
              offerId,
              productId: p.productId,
            })),
            skipDuplicates: true,
          });
        }
      }

      // 5. Update product prices based on active offers
      await updateProductPricesFromOffers(tx, userId);
    });

    return NextResponse.json({ message: 'Offer updated successfully' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to batch update offer', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Helper function to update product prices based on active offers
async function updateProductPricesFromOffers(tx: any, userId: number) {
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
    const productsWithOffers = new Map<string, any>();

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
          if (!productData.bestDiscount || discountedPrice < productData.bestDiscount.price) {
            productData.bestDiscount = {
              price: discountedPrice,
              offerId: offer.id,
              discountType: discountType.discountType,
              discountValue: discountType.discountValue,
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
    console.error('Error updating product prices from offers:', error);
    // Don't throw error to avoid breaking the main transaction
  }
}