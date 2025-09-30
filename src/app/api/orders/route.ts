import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/generated/prisma';
import { OrderItem } from '@/types/order';
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
    const archivedFlag = searchParams.get('archived');
    const userId = searchParams.get('userId');
    const checkExists = searchParams.get('checkExists');
    const orderIds = searchParams.get('orderIds');
    
    // Handle checking order existence
    if (checkExists === 'true' && orderIds) {
      try {
        const orderIdArray = JSON.parse(orderIds);
        const existingOrders = await prisma.order.findMany({
          where: {
            orderId: {
              in: orderIdArray
            },
            isDeleted: false
          },
          select: {
            orderId: true
          }
        });
        
        const existingOrderIds = existingOrders.map(order => order.orderId);
        return NextResponse.json({ existingOrderIds }, { headers });
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid orderIds format' },
          { status: 400, headers }
        );
      }
    }
    
    // Make user scoping optional for backward compatibility
    const userWhere: Record<string, unknown> = (userId && !isNaN(Number(userId))) ? { userId: Number(userId) } : {};
    
    if (id) {
      // Get single order by ID
      const includeDeleted = searchParams.get('includeDeleted') === 'true';
      const order = await prisma.order.findFirst({
        where: { 
          orderId: id,
          ...userWhere,
          ...(includeDeleted ? {} : { isDeleted: false })
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

      // Build items directly from relational rows with snapshot fallbacks
      const enrichedOrderItems = (order.orderItemsRel || []).map(oi => ({
        productId: oi.productId ?? null,
        subtotal: oi.subtotal,
        packageType: oi.packageType,
        piecesPerPackage: oi.piecesPerPackage,
        packageQuantity: oi.packageQuantity,
        pricePerPackage: oi.pricePerPackage,
        productName: oi.product?.name || (oi as { productNameSnapshot?: string }).productNameSnapshot || 'Unknown Product',
        category: oi.product?.category || (oi as { productCategorySnapshot?: string }).productCategorySnapshot || 'Uncategorized',
        brand: oi.product?.brand || 'Unknown Brand',
        description: oi.product?.description || '',
        images: oi.product?.images || [],
        productDeleted: !oi.product,
        productNameSnapshot: (oi as { productNameSnapshot?: string }).productNameSnapshot || null,
        productSkuSnapshot: (oi as { productSkuSnapshot?: string }).productSkuSnapshot || null,
        productCategorySnapshot: (oi as { productCategorySnapshot?: string }).productCategorySnapshot || null
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
    
    // Build where clause with optional multi-tenant security
    const where: Record<string, unknown> = { ...userWhere };
    if (archivedFlag === '1' || archivedFlag === 'true') {
      where.archivedAt = { not: null };
    } else {
      where.archivedAt = null;
    }
    
    // Exclude soft-deleted orders by default
    const includeDeleted = searchParams.get('includeDeleted') === 'true';
    if (!includeDeleted) {
      where.isDeleted = false;
    }
    
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
    
    // Build items from relational rows for each order (with snapshots)
    const ordersWithParsedItems = orders.map((order) => {
      const enrichedOrderItems = (order.orderItemsRel || []).map(oi => ({
        productId: oi.productId ?? null,
        subtotal: oi.subtotal,
        packageType: oi.packageType,
        piecesPerPackage: oi.piecesPerPackage,
        packageQuantity: oi.packageQuantity,
        pricePerPackage: oi.pricePerPackage,
        productName: oi.product?.name || (oi as { productNameSnapshot?: string }).productNameSnapshot || 'Unknown Product',
        category: oi.product?.category || (oi as { productCategorySnapshot?: string }).productCategorySnapshot || 'Uncategorized',
        brand: oi.product?.brand || 'Unknown Brand',
        description: oi.product?.description || '',
        images: oi.product?.images || [],
        productDeleted: !oi.product,
        productNameSnapshot: (oi as { productNameSnapshot?: string }).productNameSnapshot || null,
        productSkuSnapshot: (oi as { productSkuSnapshot?: string }).productSkuSnapshot || null,
        productCategorySnapshot: (oi as { productCategorySnapshot?: string }).productCategorySnapshot || null
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
    let orderItems: Array<{
      productId: string;
      quantity: number;
      subtotal: number;
      packageType?: string;
      piecesPerPackage?: number;
      packageQuantity?: number;
      pricePerPackage?: number;
    }> = [];
    
    if (sanitizedData.orderItems) {
      // If it's a string, parse it as JSON
      if (typeof sanitizedData.orderItems === 'string') {
        try {
          orderItems = JSON.parse(sanitizedData.orderItems);
        } catch (error) {
          orderItems = [];
        }
      } else if (Array.isArray(sanitizedData.orderItems)) {
        orderItems = sanitizedData.orderItems;
      }
    }
    
    const consistentOrderItems = await ensureAllPriceConsistency(orderItems as unknown as OrderItem[]);
    const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
    const totalQtyCalc = consistentOrderItems.reduce((sum, it) => {
      const piecesPerPackage = it.piecesPerPackage || 1;
      const packageQuantity = it.packageQuantity || 1;
      return sum + (packageQuantity * piecesPerPackage);
    }, 0);
    
    // Parse currency values (now expecting raw numbers from marketplace)
    const parseCurrencyValue = (value: unknown): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        // Parse as number directly since marketplace now sends raw numbers
        return parseFloat(value) || 0;
      }
      return 0;
    };
    
    const shippingFee = parseCurrencyValue(sanitizedData.shippingFee);
    const discounts = parseCurrencyValue(sanitizedData.discounts);
    const totalAmountCalc = subtotalCalc + shippingFee - discounts;
    

    // Determine the correct userId based on product ownership - NO FALLBACKS
    let distributorUserId = null;
    
    // Get the first product to determine the distributor
    if (Array.isArray(consistentOrderItems) && consistentOrderItems.length > 0) {
      try {
        // Try multiple lookup strategies
        let firstProduct = await prisma.product.findFirst({
          where: { productId: String(consistentOrderItems[0].productId) }
        });
        
        // If not found by productId, try by id (in case it's a numeric ID)
        if (!firstProduct && !isNaN(Number(consistentOrderItems[0].productId))) {
          firstProduct = await prisma.product.findFirst({
            where: { id: Number(consistentOrderItems[0].productId) }
          });
        }
        
        // If still not found, try by name (in case productId is actually a name)
        if (!firstProduct) {
          firstProduct = await prisma.product.findFirst({
            where: { name: { contains: String(consistentOrderItems[0].productId) } }
          });
        }
        
        if (firstProduct && firstProduct.userId) {
          distributorUserId = firstProduct.userId;
        } else {
          throw new Error(`Product not found: ${consistentOrderItems[0].productId}. Cannot determine distributor userId.`);
        }
      } catch (productError) {
        throw new Error(`Failed to determine distributor userId: ${productError instanceof Error ? productError.message : String(productError)}`);
      }
    } else {
      throw new Error('No order items provided - cannot determine distributor userId');
    }
    
    if (!distributorUserId) {
      throw new Error('Failed to determine distributor userId - this should not happen');
    }
    
    // Handle buyer creation/upsert - ensure buyer exists
    if (sanitizedData.buyerId) {
      try {
        // Use upsert to create buyer if not exists, or update if exists
        await prisma.buyer.upsert({
          where: { buyerId: String(sanitizedData.buyerId) },
          update: {
            // Update buyer info if it exists (in case contact details changed)
            owner: String(sanitizedData.contactPerson || 'Unknown'),
            email: String(sanitizedData.customerEmail || 'unknown@lakulaku.com'),
            phone: String(sanitizedData.contactPhone || '0000000000'),
            storeName: String(sanitizedData.storeName || 'Unknown Store'),
            address: String(sanitizedData.deliveryAddress || 'Unknown Address'),
            userId: distributorUserId  // Use the distributor's userId
          },
          create: {
            buyerId: String(sanitizedData.buyerId || ''),
            owner: String(sanitizedData.contactPerson || 'Unknown'),
            email: String(sanitizedData.customerEmail || 'unknown@lakulaku.com'),
            phone: String(sanitizedData.contactPhone || '0000000000'),
            storeName: String(sanitizedData.storeName || 'Unknown Store'),
            businessType: 'Retail',
            address: String(sanitizedData.deliveryAddress || 'Unknown Address'),
            status: 'Active',
            userId: distributorUserId  // Use the distributor's userId
          }
        });
      } catch (buyerError) {
        // Continue with order creation even if buyer creation fails
      }
    }
    
    // Convert orderItems to JSON string
    const orderData = {
      orderId: String(sanitizedData.orderId),
      buyerId: String(sanitizedData.buyerId || ''),  // This is the foreign key field
      buyerIdSnapshot: String(sanitizedData.buyerId || ''),
      orderDate: new Date(String(sanitizedData.orderDate || new Date())),
      orderDateSnapshot: new Date(String(sanitizedData.orderDate || new Date())),
      orderStatus: String(sanitizedData.orderStatus || 'Pending'),
      paymentStatus: String(sanitizedData.paymentStatus || 'Unpaid'),
      deliveryMethod: String(sanitizedData.deliveryMethod || 'Distributor Fleet'),
      subtotal: subtotalCalc,
      discounts: discounts,
      shippingFee: shippingFee,
      totalAmount: totalAmountCalc,
      paymentTerms: String(sanitizedData.paymentTerms || ''),
      totalOrders: totalQtyCalc,
      contactPerson: String(sanitizedData.contactPerson || ''),
      contactPersonSnapshot: String(sanitizedData.contactPerson || ''),
      storeName: String(sanitizedData.storeName || ''),
      storeNameSnapshot: String(sanitizedData.storeName || ''),
      contactPhone: String(sanitizedData.contactPhone || ''),
      contactPhoneSnapshot: String(sanitizedData.contactPhone || ''),
      customerEmail: sanitizedData.customerEmail ? String(sanitizedData.customerEmail) : null,
      customerEmailSnapshot: sanitizedData.customerEmail ? String(sanitizedData.customerEmail) : null,
      deliveryAddress: String(sanitizedData.deliveryAddress || ''),
      deliveryAddressSnapshot: String(sanitizedData.deliveryAddress || ''),
      preferredDeliveryTime: sanitizedData.preferredDeliveryTime ? String(sanitizedData.preferredDeliveryTime) : null,
      assignedLogistics: sanitizedData.assignedLogistics ? String(sanitizedData.assignedLogistics) : null,
      trackingNumber: sanitizedData.trackingNumber ? String(sanitizedData.trackingNumber) : null,
      deliveryNote: sanitizedData.deliveryNote ? String(sanitizedData.deliveryNote) : null,
      deliveryConfirmation: sanitizedData.deliveryConfirmation ? String(sanitizedData.deliveryConfirmation) : 'pending',
      pod: sanitizedData.pod ? String(sanitizedData.pod) : null,
      // Remove orderItems field - it's not a valid Prisma field, handled separately via orderItemsRel
      acceptedBy: sanitizedData.acceptedBy
        ? String(sanitizedData.acceptedBy)
        : (String(sanitizedData.orderStatus || 'Pending') === 'Confirmed' ? 'Admin' : null),
      // Auto-set acceptedAt if status is Confirmed and not explicitly provided
      acceptedAt: sanitizedData.acceptedAt
        ? new Date(String(sanitizedData.acceptedAt))
        : (String(sanitizedData.orderStatus || 'Pending') === 'Confirmed' ? new Date() : null),
      userId: distributorUserId || (typeof sanitizedData.userId === 'number' ? sanitizedData.userId : null)
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
    
    if (Array.isArray(consistentOrderItems) && consistentOrderItems.length > 0) {
      try {
        const orderItemPromises = consistentOrderItems.map(async (item: OrderItem) => {
          // Fetch the product to ensure price consistency
          const product = await prisma.product.findFirst({
            where: { productId: String(item.productId) }
          });
          
          if (!product) {
            throw new Error(`Product not found: ${item.productId}. Cannot create OrderItem without valid product.`);
          }
          
          // Use the product's sellingPrice as the unitPrice to ensure consistency
          // Parse sellingPrice correctly handling IDR format with dots as thousands separators
          let consistentUnitPrice = typeof product.sellingPrice === 'string' 
            ? parseFloat(product.sellingPrice.replace(/[^\d.-]/g, '')) || 0
            : product.sellingPrice || 0;
          
          // Handle IDR format where dots are thousands separators (e.g., "550.000" = 550000)
          if (typeof product.sellingPrice === 'string' && product.sellingPrice.includes('.')) {
            // Remove dots and parse as integer (dots are thousands separators in IDR)
            consistentUnitPrice = parseInt(product.sellingPrice.replace(/[^\d]/g, '')) || 0;
          }
          
          // Calculate package-based pricing
          const piecesPerPackage = product.piecesPerPackage || 1;
          const packageQuantity = item.packageQuantity || 1;
          const pricePerPackage = consistentUnitPrice * piecesPerPackage;
          const consistentSubtotal = packageQuantity * pricePerPackage;
          
          const orderItemData = {
            orderId: sanitizedData.orderId as string,
            productId: item.productId as string,
            subtotal: consistentSubtotal,
            packageType: item.packageType || product.packageType || null,
            piecesPerPackage: item.piecesPerPackage || product.piecesPerPackage || 1,
            packageQuantity: item.packageQuantity || 1,
            pricePerPackage: item.pricePerPackage || (product.piecesPerPackage ? consistentUnitPrice * product.piecesPerPackage : null),
            productNameSnapshot: product.name,
            productSkuSnapshot: product.sku,
            productCategorySnapshot: product.category
          };
          
          return prisma.orderItem.create({
            data: orderItemData
          });
        });
        
        await Promise.all(orderItemPromises);
      } catch (orderItemError) {
        // Don't throw here, just log the error and continue
      }
    }
    
    // Build items from relational rows for response
    const enrichedOrderItems = (order.orderItemsRel || []).map(oi => ({
      productId: oi.productId ?? null,
      subtotal: oi.subtotal,
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage,
      productName: oi.product?.name || (oi as { productNameSnapshot?: string }).productNameSnapshot || 'Unknown Product',
      category: oi.product?.category || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: (oi as { productNameSnapshot?: string }).productNameSnapshot || null,
      productSkuSnapshot: (oi as { productSkuSnapshot?: string }).productSkuSnapshot || null
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
    
    // Bulk archive support
    if (Array.isArray(body.archiveOrderIds) && body.archiveOrderIds.length > 0) {
      const baseWhere: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) baseWhere.userId = Number(body.userId);
      const updated = await prisma.order.updateMany({
        where: { ...baseWhere, orderId: { in: body.archiveOrderIds.map((v: unknown) => String(v)) } },
        data: { archivedAt: new Date() }
      });
      return NextResponse.json({ success: true, count: updated.count }, { headers });
    }

    if (body.archive === true && (body.orderId || body.id)) {
      const where: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) where.userId = Number(body.userId);
      if (body.orderId) where.orderId = String(body.orderId);
      else if (body.id) where.id = Number(body.id);

      let result = await prisma.order.updateMany({
        where,
        data: { archivedAt: new Date() }
      });
      if (result.count === 0) {
        // Retry without user filter
        let retryWhere: { orderId: string } | { id: number };
        if (body.orderId) {
          retryWhere = { orderId: String(body.orderId).trim() };
        } else if (body.id) {
          retryWhere = { id: Number(body.id) };
        } else {
          throw new Error('No orderId or id provided');
        }
        try {
          const single = await prisma.order.update({ where: retryWhere, data: { archivedAt: new Date() } });
          return NextResponse.json({ success: true }, { headers });
        } catch (e) {
          return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
        }
      }
      return NextResponse.json({ success: true }, { headers });
    }

    if ((body.unarchive === true || body.archive === false) && (body.orderId || body.id)) {
      const where: Record<string, unknown> = {};
      if (body.userId && !isNaN(Number(body.userId))) where.userId = Number(body.userId);
      if (body.orderId) where.orderId = String(body.orderId);
      else if (body.id) where.id = Number(body.id);

      let result = await prisma.order.updateMany({
        where,
        data: { archivedAt: null }
      });
      if (result.count === 0) {
        // Retry without user filter
        let retryWhere: { orderId: string } | { id: number };
        if (body.orderId) {
          retryWhere = { orderId: String(body.orderId).trim() };
        } else if (body.id) {
          retryWhere = { id: Number(body.id) };
        } else {
          throw new Error('No orderId or id provided');
        }
        try {
          const single = await prisma.order.update({ where: retryWhere, data: { archivedAt: null } });
          return NextResponse.json({ success: true }, { headers });
        } catch (e) {
          return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
        }
      }
      return NextResponse.json({ success: true }, { headers });
    }

    // Cancel order functionality
    if (body.cancel === true && (body.orderId || body.id)) {
      // Find the order first
      let whereClause: { orderId: string } | { id: number };
      if (body.orderId) {
        whereClause = { orderId: String(body.orderId).trim() };
      } else if (body.id) {
        whereClause = { id: Number(body.id) };
      } else {
        return NextResponse.json({ error: 'No orderId or id provided' }, { status: 400, headers });
      }

      // Check if order exists and is cancellable
      const existingOrder = await prisma.order.findFirst({
        where: whereClause
      });

      if (!existingOrder) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404, headers });
      }

      // Check if order can be cancelled (only Pending or Confirmed orders)
      const cancellableStatuses = ['Pending', 'Confirmed'];
      if (!cancellableStatuses.includes(existingOrder.orderStatus)) {
        return NextResponse.json({ 
          error: `Order cannot be cancelled. Current status: ${existingOrder.orderStatus}` 
        }, { status: 400, headers });
      }

      // Update order with cancellation data
      const updateData = {
        orderStatus: 'Cancelled',
        cancelledAt: new Date(),
        cancelledBy: body.cancelledBy || body.userId?.toString() || 'User',
        cancellationReason: body.reason || body.cancellationReason || 'User requested cancellation'
      };

      try {
        const updatedOrder = await prisma.order.update({ 
          where: whereClause, 
          data: updateData 
        });
        
        return NextResponse.json({ 
          success: true, 
          message: 'Order cancelled successfully',
          order: {
            orderId: updatedOrder.orderId,
            orderStatus: updatedOrder.orderStatus,
            cancelledAt: updatedOrder.cancelledAt
          }
        }, { headers });
      } catch (e) {
        return NextResponse.json({ error: 'Failed to cancel order' }, { status: 500, headers });
      }
    }

    // Skip orderId requirement for archive/unarchive/cancel operations
    if (!body.orderId && !body.archive && !body.unarchive && !body.cancel && !Array.isArray(body.archiveOrderIds)) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400, headers }
      );
    }
    
    // Skip validation for archive/unarchive/cancel operations  
    if (!body.archive && !body.unarchive && !body.cancel && !Array.isArray(body.archiveOrderIds)) {
      // Validate update data
      const validation = validateOrderUpdate(body);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400, headers }
        );
      }
    }
    
    // Sanitize update data
    const sanitizedData = sanitizeOrderData(body);
    
    // Recalculate entire order if orderItems are provided
    let recalculatedData = { ...sanitizedData };
    if (sanitizedData.orderItems) {
      const orderItems = Array.isArray(sanitizedData.orderItems) ? sanitizedData.orderItems : [];
      const consistentOrderItems = await ensureAllPriceConsistency(orderItems);
      const subtotalCalc = consistentOrderItems.reduce((sum, it) => sum + Number(it.subtotal || 0), 0);
      const totalQtyCalc = consistentOrderItems.reduce((sum, it) => {
        const piecesPerPackage = it.piecesPerPackage || 1;
        const packageQuantity = it.packageQuantity || 1;
        return sum + (packageQuantity * piecesPerPackage);
      }, 0);
      recalculatedData = {
        ...sanitizedData,
        subtotal: subtotalCalc,
        totalAmount: subtotalCalc + Number(sanitizedData.shippingFee || 0) - Number(sanitizedData.discounts || 0),
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

        // Clear cancellation fields when order status changes from 'Cancelled' to any other status
        if (prevStatus === 'Cancelled' && nextStatus !== 'Cancelled') {
          updateData.cancelledAt = null;
          updateData.cancelledBy = null;
          updateData.cancellationReason = null;
          updateData.isDeleted = false; // Also reset the soft delete flag
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
      const orderItemPromises = (sanitizedData.orderItems as Array<{ productId: string; quantity: number }>).map(async (item: { productId: string; quantity: number }) => {
        // Fetch the product to ensure price consistency
        const product = await prisma.product.findFirst({
          where: { productId: item.productId }
        });
        
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        // Use the product's sellingPrice as the unitPrice to ensure consistency
        // Parse sellingPrice correctly handling IDR format with dots as thousands separators
        let consistentUnitPrice = typeof product.sellingPrice === 'string' 
          ? parseFloat(product.sellingPrice.replace(/[^\d.-]/g, '')) || 0
          : product.sellingPrice || 0;
        
        // Handle IDR format where dots are thousands separators (e.g., "550.000" = 550000)
        if (typeof product.sellingPrice === 'string' && product.sellingPrice.includes('.')) {
          // Remove dots and parse as integer (dots are thousands separators in IDR)
          consistentUnitPrice = parseInt(product.sellingPrice.replace(/[^\d]/g, '')) || 0;
        }
        const consistentSubtotal = consistentUnitPrice * Number(item.quantity || 0);
        
        return prisma.orderItem.create({
          data: {
            orderId: sanitizedData.orderId as string,
            productId: item.productId as string,
            subtotal: consistentSubtotal,
            productNameSnapshot: product.name,
            productSkuSnapshot: product.sku,
            productCategorySnapshot: product.category,
            packageQuantity: (item as any).packageQuantity || 1,
            packageType: (item as any).packageType,
            piecesPerPackage: (item as any).piecesPerPackage || 1,
            pricePerPackage: (item as any).pricePerPackage || consistentUnitPrice
          }
        });
      });
      
      await Promise.all(orderItemPromises);
    }

    // Build items from relational rows for response
    const enrichedOrderItemsUpdate = ((order as { orderItemsRel?: Array<{ productId: string | null; subtotal: number; packageQuantity?: number; packageType?: string; piecesPerPackage?: number; pricePerPackage?: number; product?: { name: string; category: string; brand: string; description: string; images: string[] } | null; productNameSnapshot?: string; productSkuSnapshot?: string; productCategorySnapshot?: string }> }).orderItemsRel || []).map((oi) => ({
      productId: oi.productId ?? null,
      subtotal: oi.subtotal,
      packageType: oi.packageType,
      piecesPerPackage: oi.piecesPerPackage,
      packageQuantity: oi.packageQuantity,
      pricePerPackage: oi.pricePerPackage,
      productName: oi.product?.name || oi.productNameSnapshot || 'Unknown Product',
      category: oi.product?.category || 'Uncategorized',
      brand: oi.product?.brand || 'Unknown Brand',
      description: oi.product?.description || '',
      images: oi.product?.images || [],
      productDeleted: !oi.product,
      productNameSnapshot: oi.productNameSnapshot || null,
      productSkuSnapshot: oi.productSkuSnapshot || null
    }));

    return NextResponse.json({ ...order, orderItems: enrichedOrderItemsUpdate }, { headers });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to update order', detail: String(error instanceof Error ? error.message : error) }, 
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
