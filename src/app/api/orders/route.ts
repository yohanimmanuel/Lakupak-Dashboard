import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient() as any;

// GET /api/orders - Get all orders or get by ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (id) {
      // Get single order by ID
      const order = await prisma.order.findUnique({
        where: { orderId: id },
        include: {
          buyer: true,
          user: true
        }
      });

      if (!order) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }

      // Parse orderItems JSON
      const orderWithParsedItems = {
        ...order,
        orderItems: JSON.parse(order.orderItems)
      };

      return NextResponse.json(orderWithParsedItems);
    }
    
    // Get all orders with pagination and filters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');
    const buyerId = searchParams.get('buyerId');
    
    const skip = (page - 1) * limit;
    
    // Build where clause
    const where: any = {};
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
          user: true
        }
      }),
      prisma.order.count({ where })
    ]);
    
    // Parse orderItems JSON for each order
    const ordersWithParsedItems = orders.map((order: any) => ({
      ...order,
      orderItems: JSON.parse(order.orderItems)
    }));
    
    return NextResponse.json({
      orders: ordersWithParsedItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

// POST /api/orders - Create new order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const requiredFields = [
      'orderId', 'buyerId', 'orderDate', 'orderStatus', 'paymentStatus',
      'deliveryMethod', 'subtotal', 'totalAmount', 'contactPerson',
      'storeName', 'contactPhone', 'deliveryAddress'
    ];
    
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }
    
    // Convert orderItems to JSON string
    const orderData = {
      ...body,
      orderItems: JSON.stringify(body.orderItems || []),
      orderDate: new Date(body.orderDate),
      acceptedAt: body.acceptedAt ? new Date(body.acceptedAt) : null
    };
    
    const order = await prisma.order.create({
      data: orderData,
      include: {
        buyer: true,
        user: true
      }
    });
    
    // Parse orderItems back for response
    const orderWithParsedItems = {
      ...order,
      orderItems: JSON.parse(order.orderItems)
    };
    
    return NextResponse.json(orderWithParsedItems, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}

// PUT /api/orders - Update order
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400 }
      );
    }
    
    // Convert orderItems to JSON string if provided
    const updateData: any = { ...body };
    if (body.orderItems) {
      updateData.orderItems = JSON.stringify(body.orderItems);
    }
    if (body.orderDate) {
      updateData.orderDate = new Date(body.orderDate);
    }
    if (body.acceptedAt) {
      updateData.acceptedAt = new Date(body.acceptedAt);
    }
    
    const order = await prisma.order.update({
      where: { orderId: body.orderId },
      data: updateData,
      include: {
        buyer: true,
        user: true
      }
    });

    // Parse orderItems back for response
    const orderWithParsedItems = {
      ...order,
      orderItems: JSON.parse(order.orderItems)
    };

    return NextResponse.json(orderWithParsedItems);
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}

// DELETE /api/orders - Delete order
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.orderId) {
      return NextResponse.json(
        { error: 'Missing orderId' },
        { status: 400 }
      );
    }
    
    await prisma.order.delete({
      where: { orderId: body.orderId }
    });

    return NextResponse.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500 }
    );
  }
}
