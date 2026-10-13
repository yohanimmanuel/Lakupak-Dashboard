import { NextRequest } from 'next/server';
import { getOrdersHandler } from './getOrders';
import { updateOrderHandler } from './updateOrder';
import { deleteOrderHandler } from './deleteOrder';
import { createDistributorOrderHandler } from './createDistributorOrder';

export async function GET(request: NextRequest) {
  return getOrdersHandler(request);
}

export async function POST(request: NextRequest) {
  return createDistributorOrderHandler(request);
}

export async function PUT(request: NextRequest) {
  return updateOrderHandler(request);
}

export async function DELETE(request: NextRequest) {
  return deleteOrderHandler(request);
}
