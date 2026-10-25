import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedMarketplaceUserId } from '@/utils/auth-helpers';
import { isMarketplaceMember } from '@/lib/marketplace/access';

type GuardResult = { ok: true; marketplaceUserId: number } | { ok: false; response: NextResponse };

/** Signed-in retailer who belongs to this distributor's closed storefront. */
export async function requireDistributorMember(
  request: NextRequest,
  distributorId: number,
  headers: HeadersInit,
): Promise<GuardResult> {
  const auth = await getAuthenticatedMarketplaceUserId(request);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        auth.reason === 'suspended' ? { error: 'Account suspended' } : { error: 'Sign in to continue' },
        { status: auth.reason === 'suspended' ? 403 : 401, headers },
      ),
    };
  }
  if (auth.distributorId !== distributorId || !(await isMarketplaceMember(auth.userId, distributorId))) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'This storefront is only open to retailers invited by the distributor', code: 'NOT_A_MEMBER' },
        { status: 403, headers },
      ),
    };
  }
  return { ok: true, marketplaceUserId: auth.userId };
}
