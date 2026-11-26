import { NextRequest, NextResponse } from 'next/server';
import { getSecurityHeaders } from '@/utils/auth-security';
import { getAuthenticatedUserId } from '@/utils/auth-helpers';
import { approveMarketplaceAccessRequest } from '@/lib/marketplace/access';

const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' };

/** Approve a Prospect marketplace access request (requires market segment). */
export async function POST(req: NextRequest) {
  const headers = { ...getSecurityHeaders(), ...noStore };
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });
  }

  const buyerId = String((body as { buyerId?: unknown } | null)?.buyerId ?? '').trim();
  const businessType = String((body as { businessType?: unknown } | null)?.businessType ?? '').trim();
  if (!buyerId) {
    return NextResponse.json({ error: 'buyerId is required', code: 'BUYER_REQUIRED' }, { status: 400, headers });
  }

  const result = await approveMarketplaceAccessRequest({
    distributorId: userId,
    buyerId,
    businessType,
  });
  if ('error' in result) {
    const status =
      result.code === 'BUYER_NOT_FOUND' ? 404 : result.code === 'BUSINESS_TYPE_REQUIRED' ? 400 : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status, headers });
  }

  try {
    const { invalidateDashboardCache } = await import('@/lib/queryCache');
    await invalidateDashboardCache(userId);
  } catch {
    // best effort
  }

  return NextResponse.json(
    { success: true, buyerId: result.buyerId, status: 'Active', businessType },
    { status: 200, headers },
  );
}
