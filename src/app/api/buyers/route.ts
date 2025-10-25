import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';
import { 
  validateBuyerInput, 
  getSecurityHeaders, 
  sanitizeBuyerData,
  validateBuyerUpdate
} from '../../../utils/buyer-security';


const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  
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
      let buyer;
      if (/^\d+$/.test(id)) {
        buyer = await prisma.buyer.findFirst({
          where: { id: Number(id), userId: Number(userId) }
        });
      } else {
        buyer = await prisma.buyer.findFirst({
          where: { buyerId: id, userId: Number(userId) }
        });
      }
      
      if (!buyer) {
        return NextResponse.json(
          { error: 'Buyer not found' }, 
          { status: 404, headers }
        );
      }
      
      return NextResponse.json(buyer, { headers });
    }
    
    // Get all buyers with pagination support
    const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const search = req.nextUrl.searchParams.get('search') || '';
    const status = req.nextUrl.searchParams.get('status') || '';
    const businessType = req.nextUrl.searchParams.get('businessType') || '';
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' }, 
        { status: 400, headers }
      );
    }
    
    // Build where clause
    const whereClause: {
      userId: number;
      OR?: Array<{
        storeName?: { contains: string; mode: 'insensitive' };
        owner?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
        address?: { contains: string; mode: 'insensitive' };
      }>;
      status?: string;
      businessType?: string;
    } = { userId: Number(userId) };
    
    if (search) {
      whereClause.OR = [
        { storeName: { contains: search, mode: 'insensitive' } },
        { owner: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (status && status !== 'All') {
      whereClause.status = status;
    }
    
    if (businessType && businessType !== 'All Types') {
      whereClause.businessType = businessType;
    }
    
    // Get total count for pagination
    const totalCount = await prisma.buyer.count({ where: whereClause });
    
    // Get paginated results
    const buyers = await prisma.buyer.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    // Auto-sync buyer data with latest orders (including shipping fees)
    // This ensures buyer totals are always up-to-date
    for (const buyer of buyers) {
      if (buyer.buyerId) {
        try {
          await syncBuyerOrderData(buyer.buyerId, Number(userId));
        } catch (syncError) {
          // Silent fail - don't block the response
        }
      }
    }
    
    // Refetch buyers after sync to get updated data
    const updatedBuyers = await prisma.buyer.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
    
    return NextResponse.json({
      buyers: updatedBuyers,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    }, { headers });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    let data;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    if (!data.userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(data.userId.toString())) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    // Validate buyer data
    const validationResult = validateBuyerInput(data);
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: validationResult.error }, 
        { status: 400, headers }
      );
    }
    
    // Sanitize and clean the data
    const buyerData = sanitizeBuyerData(data);
    
    // Use data provided by user - store blank values, frontend will display "Missing"
    const finalBuyerData: {
      buyerId: string;
      userId: number;
      storeName: string;
      owner: string;
      email: string;
      phone: string;
      businessType: string;
      address: string;
      status: string;
      [key: string]: unknown;
    } = {
      ...buyerData,
      buyerId: String(buyerData.buyerId || ''), // Will be generated if empty
      userId: Number(data.userId), // Ensure userId is included
      // Store blank values, frontend will show "Missing" when displaying
      storeName: String(buyerData.storeName || ''),
      owner: String(buyerData.owner || ''),
      email: String(buyerData.email || ''),
      phone: String(buyerData.phone || ''),
      businessType: String(buyerData.businessType || ''),
      address: String(buyerData.address || ''),
      status: String(buyerData.status || 'Active'),
    };
    
    // Only check for unique buyerId - allow duplicate emails, names, etc. for MVP flexibility
    if (finalBuyerData.buyerId) {
      const existingBuyer = await prisma.buyer.findFirst({
        where: { 
          buyerId: finalBuyerData.buyerId, 
          userId: Number(data.userId) 
        }
      });
      
      if (existingBuyer) {
        return NextResponse.json(
          { error: 'Buyer with this ID already exists' }, 
          { status: 409, headers }
        );
      }
    }
    
    // Generate unique buyerId if not provided - ensure uniqueness
    if (!finalBuyerData.buyerId) {
      let attempts = 0;
      let newBuyerId;
      do {
        newBuyerId = 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
        attempts++;
        if (attempts > 10) {
          return NextResponse.json(
            { error: 'Unable to generate unique buyer ID' }, 
            { status: 500, headers }
          );
        }
      } while (await prisma.buyer.findFirst({
        where: { buyerId: newBuyerId, userId: Number(data.userId) }
      }));
      finalBuyerData.buyerId = newBuyerId;
    }
    
    const buyer = await prisma.buyer.create({
      data: finalBuyerData
    });
    
    return NextResponse.json(buyer, { 
      status: 201, 
      headers: {
        ...headers,
        'Location': `/api/buyers/${buyer.id}`
      }
    });
    
  } catch (error: unknown) {
    // Handle Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Buyer with this ID already exists' }, 
        { status: 409, headers }
      );
    }
    
    // Provide more specific error messages
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return NextResponse.json(
        { error: error.message }, 
        { status: 400, headers }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500, headers }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const headers = getSecurityHeaders();
  
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
      deleted = await prisma.buyer.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Buyer not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.buyer.delete({
        where: { id: Number(id) }
      });
    } else {
      deleted = await prisma.buyer.findFirst({
        where: { buyerId: id, userId: Number(userId) }
      });
      
      if (!deleted) {
        return NextResponse.json(
          { error: 'Buyer not found' }, 
          { status: 404, headers }
        );
      }
      
      await prisma.buyer.delete({
        where: { buyerId: id }
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      deleted,
      message: 'Buyer deleted successfully'
    }, { headers });
    
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to delete buyer' }, 
      { status: 500, headers }
    );
  }
}

export async function PUT(req: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    let data;
    try {
      data = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request format' }, 
        { status: 400, headers }
      );
    }
    
    if (!data.userId) {
      return NextResponse.json(
        { error: 'Missing userId parameter' }, 
        { status: 400, headers }
      );
    }
    
    // Validate userId format
    if (!/^\d+$/.test(data.userId.toString())) {
      return NextResponse.json(
        { error: 'Invalid userId format' }, 
        { status: 400, headers }
      );
    }
    
    const { id, buyerId, userId, ...updateData } = data;
    
    // Validate update data
    const validationResult = validateBuyerUpdate(updateData);
    if (!validationResult.valid) {
      return NextResponse.json(
        { error: validationResult.error }, 
        { status: 400, headers }
      );
    }
    
    // Check if buyer exists and belongs to user
    let existingBuyer;
    if (id) {
      existingBuyer = await prisma.buyer.findFirst({
        where: { id: Number(id), userId: Number(userId) }
      });
    } else if (buyerId) {
      existingBuyer = await prisma.buyer.findFirst({
        where: { buyerId: buyerId, userId: Number(userId) }
      });
    } else {
      return NextResponse.json(
        { error: 'Missing id or buyerId parameter' }, 
        { status: 400, headers }
      );
    }
    
    if (!existingBuyer) {
      return NextResponse.json(
        { error: 'Buyer not found' }, 
        { status: 404, headers }
      );
    }
    
    // Check for email conflicts if email is being updated
    if (updateData.email && updateData.email !== existingBuyer.email) {
      const emailConflict = await prisma.buyer.findFirst({
        where: { 
          email: updateData.email, 
          userId: Number(userId),
          id: { not: existingBuyer.id }
        }
      });
      
      if (emailConflict) {
        return NextResponse.json(
          { error: 'Another buyer with this email already exists' }, 
          { status: 409, headers }
        );
      }
    }
    
    // Sanitize update data
    const cleanUpdateData = sanitizeBuyerData(updateData);
    
    // Update buyer
    let buyer;
    if (id) {
      buyer = await prisma.buyer.update({
        where: { id: Number(id) },
        data: cleanUpdateData
      });
    } else {
      buyer = await prisma.buyer.update({
        where: { buyerId: buyerId },
        data: cleanUpdateData
      });
    }
    
    // Ensure we always return the buyerId for proper routing
    const responseData = {
      ...buyer,
      buyerId: buyer.buyerId || buyerId
    };
    
    return NextResponse.json(responseData, { headers });
    
  } catch (error: unknown) {
    // Handle Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Buyer with this identifier already exists' }, 
        { status: 409, headers }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to update buyer' }, 
      { status: 500, headers }
    );
  }
}

// Function to sync buyer order data (including shipping fees)
async function syncBuyerOrderData(buyerId: string, userId: number) {
  try {
    // Get buyer
    const buyer = await prisma.buyer.findFirst({
      where: { buyerId, userId }
    });
    
    if (!buyer) return;
    
    // Get all orders for this buyer
    const orders = await prisma.order.findMany({
      where: { 
        buyerId, 
        userId,
        orderStatus: { notIn: ['Cancelled', 'Returned'] } // Exclude cancelled and returned orders
      },
      include: {
        orderItemsRel: {
          include: {
            product: true
          }
        }
      },
      orderBy: { orderDate: 'desc' }
    });
    
    // Process orders into orderDetails format
    const orderDetails = orders.map(order => {
      // Get all products in this order as a comma-separated string
      const productNames = order.orderItemsRel.map(item => 
        item.product?.name || item.productNameSnapshot || 'Unknown Product'
      ).join(', ');
      
      // Calculate total orders (sum of all package quantities)
      const totalOrders = order.orderItemsRel.reduce((sum, item) => sum + (item.packageQuantity || 1), 0);
      
      // Calculate total spend for this order (including shipping fee)
      const totalSpend = order.orderItemsRel.reduce((sum, item) => sum + item.subtotal, 0) + (order.shippingFee || 0);
      
      // Calculate outstanding amount for this order (unpaid orders, including shipping fee)
      const outstanding = (order.paymentStatus === 'Pending' || order.paymentStatus === 'Unpaid') ? totalSpend : 0;
      
      // Calculate free items from promotions
      let totalFreeItems = 0;
      let discountBadge = '';
      let hasOfferApplied = false;
      
      order.orderItemsRel.forEach(item => {
        if (item.offerApplied) {
          hasOfferApplied = true;
          
          // Calculate free items from promotion
          if (item.promotionDetailsSnapshot) {
            try {
              const promoDetails = JSON.parse(item.promotionDetailsSnapshot);
              if (promoDetails.minQuantity && promoDetails.freeQuantity) {
                const freeQty = Math.floor((item.packageQuantity || 1) / promoDetails.minQuantity) * promoDetails.freeQuantity;
                totalFreeItems += freeQty;
              }
            } catch {
              // Invalid JSON, skip
            }
          }
          
          // Set discount badge
          if (item.discountPercentage) {
            discountBadge = `${item.discountPercentage}% OFF`;
          } else if (item.discountAmount) {
            discountBadge = `Rp ${item.discountAmount.toLocaleString('id-ID')} OFF`;
          }
        }
      });
      
      return {
        orderNo: order.orderId,
        product: productNames,
        totalOrders: totalOrders.toString(),
        totalSpend: totalSpend.toString(),
        shippingFee: (order.shippingFee || 0).toString(),
        lastOrderDate: order.orderDate.toISOString().split('T')[0],
        outstanding: outstanding.toString(),
        freeItems: totalFreeItems > 0 ? totalFreeItems : undefined,
        discountBadge: discountBadge || undefined,
        offerApplied: hasOfferApplied
      };
    });
    
    // Update buyer with new order details
    await prisma.buyer.update({
      where: { id: buyer.id },
      data: {
        orderDetails: JSON.stringify(orderDetails),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    // Silent fail
  }
}

