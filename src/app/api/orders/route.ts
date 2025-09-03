import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/generated/prisma';
import { 
  getOrderSecurityHeaders, 
  validateOrderInput, 
  validateOrderUpdate,
  sanitizeOrderData,
  generateSecureOrderId,
  validateOrderAccess
} from '@/utils/order-security';
import { recalculateEntireOrder, validateAndCorrectOrder, ensureAllPriceConsistency } from '@/utils/orderUtils';


const prisma = new PrismaClient();

// GET /api/orders - Get all orders or get by ID
export async function GET(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');
    
    // For backward compatibility, allow requests without userId for existing data
    // In production, this should be required for multi-tenant security
    let userIdFilter = {};
    if (userId) {
      // Convert userId to number if it's a valid number string
      const numericUserId = Number(userId);
      if (isNaN(numericUserId)) {
        return NextResponse.json(
          { error: 'Invalid userId format' }, 
          { status: 400, headers }
        );
      }
      // For now, allow both the specific userId AND null userId (existing data)
      // This ensures existing data shows up while maintaining security for new data
      userIdFilter = {
        OR: [
          { userId: numericUserId },
          { userId: null }
        ]
      };
    }
    
          if (id) {
        // Get single order by ID
        const order = await prisma.order.findFirst({
          where: { 
            orderId: id,
            ...userIdFilter // Multi-tenant security (if userId provided)
          },
          include: {
            buyer: true,
            user: true,
            orderItemsRel: {
              include: {
                product: true
              }
            }
          }
        });

      if (!order) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404, headers }
        );
      }

      // Parse orderItems JSON and merge with OrderItem table data
      const parsedOrderItems = JSON.parse(order.orderItems);
      const enrichedOrderItems = parsedOrderItems.map((jsonItem: any) => {
        // Find corresponding OrderItem with product data
        const orderItemWithProduct = order.orderItemsRel?.find(
          (orderItem: any) => orderItem.productId === jsonItem.productId
        );
        
        return {
          ...jsonItem,
          productName: orderItemWithProduct?.product?.name || 'Unknown Product',
          category: orderItemWithProduct?.product?.category || 'Uncategorized',
          brand: orderItemWithProduct?.product?.brand || 'Unknown Brand',
          description: orderItemWithProduct?.product?.description || '',
          images: orderItemWithProduct?.product?.images || []
        };
      });

      let orderWithParsedItems = {
        ...order,
        orderItems: enrichedOrderItems
      };

      // Auto-validate and correct data on every fetch
      const { order: validatedOrder, wasCorrected } = validateAndCorrectOrder(orderWithParsedItems as any);
      
      // If corrections were made, update the database automatically
      if (wasCorrected) {
        try {
          const updateData = {
            orderId: validatedOrder.orderId,
            orderItems: validatedOrder.orderItems,
            subtotal: validatedOrder.subtotal,
            totalAmount: validatedOrder.totalAmount,
            totalOrders: validatedOrder.totalOrders,
            taxes: validatedOrder.taxes,
            shippingFee: validatedOrder.shippingFee,
            discounts: validatedOrder.discounts,
            orderStatus: validatedOrder.orderStatus,
            paymentStatus: validatedOrder.paymentStatus,
            deliveryMethod: validatedOrder.deliveryMethod,
            trackingNumber: validatedOrder.trackingNumber,
            contactPerson: validatedOrder.contactPerson,
            orderDate: validatedOrder.orderDate,
            acceptedAt: validatedOrder.acceptedAt,
          };

          await prisma.order.update({
            where: { orderId: validatedOrder.orderId },
            data: {
              ...updateData,
              orderItems: JSON.stringify(validatedOrder.orderItems),
              orderDate: new Date(validatedOrder.orderDate),
              acceptedAt: validatedOrder.acceptedAt ? new Date(validatedOrder.acceptedAt) : null
            }
          });
        } catch (error) {
        }
      }

      return NextResponse.json(validatedOrder, { headers });
    }
    
    // Get all orders with pagination and filters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const buyerId = searchParams.get('buyerId');
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' }, 
        { status: 400, headers }
      );
    }
    
    const skip = (page - 1) * limit;
    
    // Build where clause with multi-tenant security
    const where = { ...userIdFilter } as any;
    if (status && status !== 'All') where.orderStatus = status;
    if (buyerId) where.buyerId = buyerId;
    
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          buyer: true,
          user: true,
          orderItemsRel: {
            include: {
              product: true
            }
          }
        }
      }),
      prisma.order.count({ where })
    ]);
    
    // Parse orderItems JSON for each order and auto-validate
    const ordersWithParsedItems = orders.map((order) => {
      // Parse orderItems JSON and merge with OrderItem table data
      const parsedOrderItems = JSON.parse(order.orderItems);
      const enrichedOrderItems = parsedOrderItems.map((jsonItem: any) => {
        // Find corresponding OrderItem with product data
        const orderItemWithProduct = order.orderItemsRel?.find(
          (orderItem: any) => orderItem.productId === jsonItem.productId
        );
        
        return {
          ...jsonItem,
          productName: orderItemWithProduct?.product?.name || 'Unknown Product',
          category: orderItemWithProduct?.product?.category || 'Uncategorized',
          brand: orderItemWithProduct?.product?.brand || 'Unknown Brand',
          description: orderItemWithProduct?.product?.description || '',
          images: orderItemWithProduct?.product?.images || []
        };
      });

      const orderWithParsedItems = {
        ...order,
        orderItems: enrichedOrderItems
      };
      
      // Auto-validate and correct each order
      const { order: validatedOrder, wasCorrected } = validateAndCorrectOrder(orderWithParsedItems as any);
      
      // If corrections were made, update the database automatically (async, don't wait)
      if (wasCorrected) {
        prisma.order.update({
          where: { orderId: validatedOrder.orderId },
          data: {
            orderItems: JSON.stringify(validatedOrder.orderItems),
            subtotal: validatedOrder.subtotal,
            totalAmount: validatedOrder.totalAmount,
            totalOrders: validatedOrder.totalOrders,
          }
        }).catch(error => {
        });
      }
      
      return validatedOrder;
    });
    
    return NextResponse.json({
      orders: ordersWithParsedItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500, headers }
    );
  }
}

// POST /api/orders - Create new order
export async function POST(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();
    
    // Validate input data
    const validation = validateOrderInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers }
      );
    }
    
    // Sanitize input data
    const sanitizedData = sanitizeOrderData(body);
    
    // Generate order ID if not provided
    if (!sanitizedData.orderId) {
      sanitizedData.orderId = generateSecureOrderId();
    }
    
    // Ensure price consistency and recalculate entire order
    const orderItems = Array.isArray(sanitizedData.orderItems) ? sanitizedData.orderItems : [];
    const consistentOrderItems = await ensureAllPriceConsistency(orderItems);
    const recalculatedOrder = recalculateEntireOrder({
      ...sanitizedData,
      orderItems: consistentOrderItems
    } as any);
    
    // Convert orderItems to JSON string
    const orderData = {
      ...recalculatedOrder,
      orderItems: JSON.stringify(recalculatedOrder.orderItems),
      orderDate: new Date(String(sanitizedData.orderDate || new Date())),
      acceptedAt: sanitizedData.acceptedAt ? new Date(String(sanitizedData.acceptedAt)) : null
    };
    
    const order = await (prisma.order.create as any)({
      data: orderData,
      include: {
        buyer: true,
        user: true,
        orderItemsRel: {
          include: {
            product: true
          }
        }
      }
    });
    
    // Create OrderItem records for each item with price consistency
    if (recalculatedOrder.orderItems && Array.isArray(recalculatedOrder.orderItems)) {
      const orderItemPromises = recalculatedOrder.orderItems.map(async (item: any) => {
        // Fetch the product to ensure price consistency
        const product = await prisma.product.findFirst({
          where: { productId: item.productId }
        });
        
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        // Use the product's sellingPrice as the unitPrice to ensure consistency
        const consistentUnitPrice = parseFloat(product.sellingPrice);
        const consistentSubtotal = consistentUnitPrice * item.quantity;
        
        return prisma.orderItem.create({
          data: {
            orderId: sanitizedData.orderId as string,
            productId: item.productId as string,
            quantity: item.quantity as number,
            unitPrice: consistentUnitPrice,
            subtotal: consistentSubtotal
          }
        });
      });
      
      await Promise.all(orderItemPromises);
    }
    
    // Parse orderItems back for response and enrich with product data
    const parsedOrderItems = JSON.parse(order.orderItems);
    const enrichedOrderItems = parsedOrderItems.map((jsonItem: any) => {
      // Find corresponding OrderItem with product data
      const orderItemWithProduct = order.orderItemsRel?.find(
        (orderItem: any) => orderItem.productId === jsonItem.productId
      );
      
      return {
        ...jsonItem,
        productName: orderItemWithProduct?.product?.name || 'Unknown Product',
        category: orderItemWithProduct?.product?.category || 'Uncategorized',
        brand: orderItemWithProduct?.product?.brand || 'Unknown Brand',
        description: orderItemWithProduct?.product?.description || '',
        images: orderItemWithProduct?.product?.images || []
      };
    });

    const orderWithParsedItems = {
      ...order,
      orderItems: enrichedOrderItems
    };
    
    return NextResponse.json(orderWithParsedItems, { status: 201, headers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500, headers }
    );
  }
}

// PUT /api/orders - Update order
export async function PUT(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();
    
    if (!body.orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400, headers }
      );
    }
    
    // Validate update data
    const validation = validateOrderUpdate(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400, headers }
      );
    }
    
    // Sanitize update data
    const sanitizedData = sanitizeOrderData(body);
    
    // Recalculate entire order if orderItems are provided
    let recalculatedData = { ...sanitizedData };
    if (sanitizedData.orderItems) {
      const orderItems = Array.isArray(sanitizedData.orderItems) ? sanitizedData.orderItems : [];
      const consistentOrderItems = await ensureAllPriceConsistency(orderItems);
      const recalculatedOrder = recalculateEntireOrder({
        ...sanitizedData,
        orderItems: consistentOrderItems
      } as any);
      
      recalculatedData = {
        ...recalculatedOrder,
        orderItems: JSON.stringify(recalculatedOrder.orderItems)
      };
    }
    
    // Convert orderItems to JSON string if provided
    const updateData: Record<string, unknown> = recalculatedData;
    if (sanitizedData.orderDate) {
      updateData.orderDate = new Date(String(sanitizedData.orderDate));
    }
    if (sanitizedData.acceptedAt) {
      updateData.acceptedAt = new Date(String(sanitizedData.acceptedAt));
    }
    
    // For backward compatibility, don't require userId for updates
    const order = await (prisma.order.update as any)({
      where: { orderId: sanitizedData.orderId },
      data: updateData,
      include: {
        buyer: true,
        user: true,
        orderItemsRel: {
          include: {
            product: true
          }
        }
      }
    });

    // Update OrderItem records if orderItems were provided
    if (sanitizedData.orderItems && Array.isArray(sanitizedData.orderItems)) {
      // Delete existing OrderItem records for this order
      await prisma.orderItem.deleteMany({
        where: { orderId: sanitizedData.orderId as string }
      });
      
      // Create new OrderItem records with price consistency
      const orderItemPromises = sanitizedData.orderItems.map(async (item: any) => {
        // Fetch the product to ensure price consistency
        const product = await prisma.product.findFirst({
          where: { productId: item.productId }
        });
        
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        // Use the product's sellingPrice as the unitPrice to ensure consistency
        const consistentUnitPrice = parseFloat(product.sellingPrice);
        const consistentSubtotal = consistentUnitPrice * item.quantity;
        
        return prisma.orderItem.create({
          data: {
            orderId: sanitizedData.orderId as string,
            productId: item.productId as string,
            quantity: item.quantity as number,
            unitPrice: consistentUnitPrice,
            subtotal: consistentSubtotal
          }
        });
      });
      
      await Promise.all(orderItemPromises);
    }

    // Parse orderItems back for response and enrich with product data
    const parsedOrderItems = JSON.parse(order.orderItems);
    const enrichedOrderItems = parsedOrderItems.map((jsonItem: any) => {
      // Find corresponding OrderItem with product data
      const orderItemWithProduct = order.orderItemsRel?.find(
        (orderItem: any) => orderItem.productId === jsonItem.productId
      );
      
      return {
        ...jsonItem,
        productName: orderItemWithProduct?.product?.name || 'Unknown Product',
        category: orderItemWithProduct?.product?.category || 'Uncategorized',
        brand: orderItemWithProduct?.product?.brand || 'Unknown Brand',
        description: orderItemWithProduct?.product?.description || '',
        images: orderItemWithProduct?.product?.images || []
      };
    });

    const orderWithParsedItems = {
      ...order,
      orderItems: enrichedOrderItems
    };

    return NextResponse.json(orderWithParsedItems, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500, headers }
    );
  }
}

// DELETE /api/orders - Delete order
export async function DELETE(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const body = await request.json();
    
    if (!body.orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400, headers }
      );
    }
    
    // Validate order ID format
    const { validateOrderId } = await import('@/utils/order-security');
    if (!validateOrderId(String(body.orderId))) {
      return NextResponse.json(
        { error: 'Invalid order ID format' },
        { status: 400, headers }
      );
    }
    
    // Delete OrderItem records first (due to foreign key constraint)
    await prisma.orderItem.deleteMany({
      where: { orderId: body.orderId }
    });
    
    // Delete the order
    await prisma.order.delete({
      where: { orderId: body.orderId }
    });

    return NextResponse.json({ message: 'Order deleted successfully' }, { headers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500, headers }
    );
  }
}
