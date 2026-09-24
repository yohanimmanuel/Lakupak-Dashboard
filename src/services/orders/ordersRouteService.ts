import { NextRequest, NextResponse } from 'next/server';
import { getOrdersHandler } from './getOrders';
import { updateOrderHandler } from './updateOrder';
import { deleteOrderHandler } from './deleteOrder';
import { getOrderSecurityHeaders } from '@/utils/order-security';

// Dashboard does not create orders — marketplace / mobile checkout owns creation.
// POST kept as an explicit 405 so old clients get a clear response.

export async function GET(request: NextRequest) {
  return getOrdersHandler(request);
}

export async function POST(request: NextRequest) {
  const headers = getOrderSecurityHeaders();
  return NextResponse.json(
    {
      error:
        'Order creation via the dashboard API is disabled. Create orders through the Lakupak marketplace checkout.',
    },
    { status: 405, headers: { ...headers, Allow: 'GET, PUT, DELETE' } },
  );
}

export async function PUT(request: NextRequest) {
  return updateOrderHandler(request);
}

export async function DELETE(request: NextRequest) {
  return deleteOrderHandler(request);
}
