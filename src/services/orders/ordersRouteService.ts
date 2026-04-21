import { NextRequest } from 'next/server';
import { getOrdersHandler } from './getOrders';
import { createOrderHandler } from './createOrder';
import { updateOrderHandler } from './updateOrder';
import { deleteOrderHandler } from './deleteOrder';

// This file is intentionally a move-only refactor of the previous `route.ts`.
// Behavior is preserved; call sites should re-export these handlers.

export async function GET(request: NextRequest) {
  return getOrdersHandler(request);
}

// NOTE: POST/PUT/DELETE logic lives in the handler modules (`createOrder.ts`, `updateOrder.ts`, `deleteOrder.ts`).
// This file is a thin orchestrator that delegates to those handlers.

export async function POST(request: NextRequest) {
  return createOrderHandler(request);
}

export async function PUT(request: NextRequest) {
  return updateOrderHandler(request);
}

export async function DELETE(request: NextRequest) {
  return deleteOrderHandler(request);
}

