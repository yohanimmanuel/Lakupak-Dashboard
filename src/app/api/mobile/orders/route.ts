import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '../../../../utils/auth-security';
import { createMobileMarketplaceOrders, getMobileMarketplaceOrders } from '@/services/mobileOrders/mobileOrdersService';
import { orderCreationRateLimiter, orderQueryRateLimiter } from '@/utils/rateLimiter';
import { auditOrder } from '@/lib/audit';


// GET /api/mobile/orders - Get mobile marketplace user's orders
export async function GET(request: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    const { getAuthenticatedMarketplaceUserId } = await import('@/utils/auth-helpers');
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const tokenUserId = auth.userId;

    const rateLimitResponse = await orderQueryRateLimiter(request, tokenUserId);
    if (rateLimitResponse) return rateLimitResponse;

    return await getMobileMarketplaceOrders(request, tokenUserId);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500, headers }
    );
  }
}

// POST /api/mobile/orders - Create new order for mobile marketplace user
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();
  
  try {
    const { getAuthenticatedMarketplaceUserId } = await import('@/utils/auth-helpers');
    const auth = await getAuthenticatedMarketplaceUserId(request);
    if (!auth.ok) {
      if (auth.reason === 'suspended') {
        return NextResponse.json({ error: 'Account suspended' }, { status: 403, headers });
      }
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }
    const tokenUserId = auth.userId;

    const rateLimitResponse = await orderCreationRateLimiter(request, tokenUserId);
    if (rateLimitResponse) return rateLimitResponse;

    const response = await createMobileMarketplaceOrders(request, tokenUserId);

    // Best-effort: capture the created order id from the response for the audit trail.
    let createdOrderId: string | undefined;
    try {
      const data = await response.clone().json();
      createdOrderId =
        data?.order?.orderId ??
        data?.orderId ??
        (Array.isArray(data?.orders) ? data.orders[0]?.orderId : undefined);
    } catch {
      // ignore parse errors; still record the action
    }
    auditOrder(request, {
      action: 'create',
      resourceId: createdOrderId,
      actorId: tokenUserId,
      actorType: 'marketplace',
      success: response.ok,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create order', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers }
    );
  }
}

