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
import { Order } from '@/generated/prisma';


const prisma = new PrismaClient();

// GET /api/orders - Get all orders or get by ID
export async function GET(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const userId = searchParams.get('userId');
    // Enforce userId strictly
    if (!userId || isNaN(Number(userId))) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400, headers });
    }
    const userWhere = { userId: Number(userId) } as const;
    
          if (id) {
        // Get single order by ID
        const order = await prisma.order.findFirst({
          where: { 
            orderId: id,
            ...userWhere
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

      // Build items directly from relational rows (no JSON dependency)
      const enrichedOrderItems = (order.orderItemsRel || []).map(oi => ({
        productId: oi.productId,
        quantity: oi.quantity,
        unitPrice: oi.unitPrice,
        subtotal: oi.subtotal,
        productName: oi.product?.name || 'Unknown Product',
        category: oi.product?.category || 'Uncategorized',
        brand: oi.product?.brand || 'Unknown Brand',
        description: oi.product?.description || '',
        images: oi.product?.images || []
      }));

      return NextResponse.json({ ...order, orderItems: enrichedOrderItems }, { headers });
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
    
    // Build where clause with multi-tenant security (strict)
    const where = { ...userWhere } as any;
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
    
    // Build items from relational rows for each order (no JSON dependency)
    const ordersWithParsedItems = orders.map((order) => {
      const enrichedOrderItems = (order.orderItemsRel || []).map(oi => ({
        productId: oi.productId,
        quantity: oi.quantity,
        unitPrice: oi.unitPrice,
        subtotal: oi.subtotal,
        productName: oi.product?.name || 'Unknown Product',
        category: oi.product?.category || 'Uncategorized',
        brand: oi.product?.brand || 'Unknown Brand',
        description: oi.product?.description || '',
        images: oi.product?.images || []
      }));
      return { ...order, orderItems: enrichedOrderItems };
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
    
    // Ensure price consistency and compute totals
    const orderItems = Array.isArray(sanitizedData.orderItems) ? sanitizedData.orderItems : [];
    const consistentOrderItems = await ensureAllPriceConsistency(orderItems);
    const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || (it.unitPrice || 0) * (it.quantity || 0)), 0);
    const totalQtyCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    const taxes = Number(sanitizedData.taxes || 0);
    const shippingFee = Number(sanitizedData.shippingFee || 0);
    const discounts = Number(sanitizedData.discounts || 0);
    const totalAmountCalc = subtotalCalc + taxes + shippingFee - discounts;
    
    // Convert orderItems to JSON string
    const orderData = {
      orderId: String(sanitizedData.orderId),
      buyerId: String(sanitizedData.buyerId || ''),
      orderDate: new Date(String(sanitizedData.orderDate || new Date())),
      orderStatus: String(sanitizedData.orderStatus || 'Pending'),
      paymentStatus: String(sanitizedData.paymentStatus || 'Unpaid'),
      deliveryMethod: String(sanitizedData.deliveryMethod || 'Distributor Fleet'),
      subtotal: subtotalCalc,
      discounts,
      taxes,
      shippingFee,
      totalAmount: totalAmountCalc,
      paymentTerms: String(sanitizedData.paymentTerms || ''),
      totalOrders: totalQtyCalc,
      contactPerson: String(sanitizedData.contactPerson || ''),
      storeName: String(sanitizedData.storeName || ''),
      contactPhone: String(sanitizedData.contactPhone || ''),
      customerEmail: sanitizedData.customerEmail ? String(sanitizedData.customerEmail) : null,
      deliveryAddress: String(sanitizedData.deliveryAddress || ''),
      preferredDeliveryTime: sanitizedData.preferredDeliveryTime ? String(sanitizedData.preferredDeliveryTime) : null,
      assignedLogistics: sanitizedData.assignedLogistics ? String(sanitizedData.assignedLogistics) : null,
      trackingNumber: sanitizedData.trackingNumber ? String(sanitizedData.trackingNumber) : null,
      deliveryNote: sanitizedData.deliveryNote ? String(sanitizedData.deliveryNote) : null,
      deliveryConfirmation: sanitizedData.deliveryConfirmation ? String(sanitizedData.deliveryConfirmation) : 'pending',
      pod: sanitizedData.pod ? String(sanitizedData.pod) : null,
      orderItems: JSON.stringify(consistentOrderItems),
      acceptedBy: sanitizedData.acceptedBy
        ? String(sanitizedData.acceptedBy)
        : (String(sanitizedData.orderStatus || 'Pending') === 'Confirmed' ? 'Admin' : null),
      // Auto-set acceptedAt if status is Confirmed and not explicitly provided
      acceptedAt: sanitizedData.acceptedAt
        ? new Date(String(sanitizedData.acceptedAt))
        : (String(sanitizedData.orderStatus || 'Pending') === 'Confirmed' ? new Date() : null),
      userId: typeof sanitizedData.userId === 'number' ? sanitizedData.userId : null
    };
    
    const order = await prisma.order.create({
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
    if (Array.isArray(consistentOrderItems)) {
      const orderItemPromises = consistentOrderItems.map(async (item: { productId: string; quantity: number; unitPrice?: number; subtotal?: number }) => {
        // Fetch the product to ensure price consistency
        const product = await prisma.product.findFirst({
          where: { productId: item.productId }
        });
        
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        // Use the product's sellingPrice as the unitPrice to ensure consistency
        const consistentUnitPrice = parseFloat(product.sellingPrice);
        const consistentSubtotal = consistentUnitPrice * Number(item.quantity || 0);
        
        return prisma.orderItem.create({
          data: {
            orderId: sanitizedData.orderId as string,
            productId: item.productId as string,
            quantity: Number(item.quantity || 0),
            unitPrice: consistentUnitPrice,
            subtotal: consistentSubtotal
          }
        });
      });
      
      await Promise.all(orderItemPromises);
    }
    
    // Build items from relational rows for response
    const enrichedOrderItems = (order.orderItemsRel || []).map(oi => ({
      productId: oi.productId,
      quantity: oi.quantity,
      unitPrice: oi.unitPrice,
      subtotal: oi.subtotal,
      productName: oi.product?.name || 'Unknown Product',
      category: oi.product?.category || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || []
    }));

    return NextResponse.json({ ...order, orderItems: enrichedOrderItems }, { status: 201, headers });
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
      const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || (it.unitPrice || 0) * (it.quantity || 0)), 0);
      const totalQtyCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
      recalculatedData = {
        ...sanitizedData,
        subtotal: subtotalCalc,
        totalAmount: subtotalCalc + Number(sanitizedData.taxes || 0) + Number(sanitizedData.shippingFee || 0) - Number(sanitizedData.discounts || 0),
        totalOrders: totalQtyCalc,
        orderItems: JSON.stringify(consistentOrderItems)
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

    // Auto-set acceptedAt on status transition to Confirmed when not provided
    if (!sanitizedData.acceptedAt && typeof sanitizedData.orderId === 'string' && sanitizedData.orderStatus) {
      const existing = await prisma.order.findUnique({ where: { orderId: String(sanitizedData.orderId) } });
      if (existing) {
        const nextStatus = String(sanitizedData.orderStatus);
        const prevStatus = String(existing.orderStatus || '');
        if (nextStatus === 'Confirmed' && !existing.acceptedAt) {
          updateData.acceptedAt = new Date();
          if (!sanitizedData.acceptedBy && !existing.acceptedBy) {
            updateData.acceptedBy = 'Admin';
          }
        }

        // Auto-wire deliveryConfirmation based on orderStatus if not explicitly provided
        if (!sanitizedData.deliveryConfirmation) {
          if (nextStatus === 'Pending') {
            updateData.deliveryConfirmation = 'pending';
          } else if (nextStatus === 'Confirmed') {
            updateData.deliveryConfirmation = 'confirmed';
          } else if (nextStatus === 'Shipped' || nextStatus === 'Packed') {
            updateData.deliveryConfirmation = 'in_transit';
          } else if (nextStatus === 'Delivered') {
            updateData.deliveryConfirmation = 'delivered';
          } else if (nextStatus === 'Cancelled' || nextStatus === 'Returned') {
            updateData.deliveryConfirmation = nextStatus.toLowerCase();
          }
        }
      }
    }
    
    // For backward compatibility, don't require userId for updates
    const order = await prisma.order.update({
      where: { orderId: String(sanitizedData.orderId) },
      data: updateData,
      include: {
        buyer: true,
        user: true,
        orderItemsRel: false
      }
    });

    // Update OrderItem records if orderItems were provided
    if (sanitizedData.orderItems && Array.isArray(sanitizedData.orderItems)) {
      // Delete existing OrderItem records for this order
      await prisma.orderItem.deleteMany({
        where: { orderId: sanitizedData.orderId as string }
      });
      
      // Create new OrderItem records with price consistency
      const orderItemPromises = sanitizedData.orderItems.map(async (item: { productId: string; quantity: number }) => {
        // Fetch the product to ensure price consistency
        const product = await prisma.product.findFirst({
          where: { productId: item.productId }
        });
        
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        // Use the product's sellingPrice as the unitPrice to ensure consistency
        const consistentUnitPrice = parseFloat(product.sellingPrice);
        const consistentSubtotal = consistentUnitPrice * Number(item.quantity || 0);
        
        return prisma.orderItem.create({
          data: {
            orderId: sanitizedData.orderId as string,
            productId: item.productId as string,
            quantity: Number(item.quantity || 0),
            unitPrice: consistentUnitPrice,
            subtotal: consistentSubtotal
          }
        });
      });
      
      await Promise.all(orderItemPromises);
    }

    // Build items from relational rows for response
    const enrichedOrderItemsUpdate = ((order as any).orderItemsRel || []).map((oi: any) => ({
      productId: oi.productId,
      quantity: oi.quantity,
      unitPrice: oi.unitPrice,
      subtotal: oi.subtotal,
      productName: oi.product?.name || 'Unknown Product',
      category: oi.product?.category || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || []
    }));

    return NextResponse.json({ ...order, orderItems: enrichedOrderItemsUpdate }, { headers });
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
