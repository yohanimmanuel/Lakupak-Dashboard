import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { applyBuyerReturnStockDecision } from '@/lib/clients/buyerReturnRecords';

/**
 * POST /api/buyers/return-stock
 * Body: { returnRecordId: number, decision: 'restocked' | 'skipped' }
 *
 * Distributor decides whether a returned line is reusable sellable stock.
 */
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const { getAuthenticatedUserId } = await import('@/utils/auth-helpers');
    const authenticatedUserId = await getAuthenticatedUserId(request);
    let isPlatformAdmin = false;
    try {
      const { requirePlatformAdminId } = await import('@/utils/platform-admin-auth');
      requirePlatformAdminId(request);
      isPlatformAdmin = true;
    } catch {
      // not platform admin
    }

    if (!authenticatedUserId && !isPlatformAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    const body = await request.json().catch(() => ({}));
    const returnRecordId = Number((body as { returnRecordId?: unknown }).returnRecordId);
    const decisionRaw = String((body as { decision?: unknown }).decision ?? '').trim();
    const decision =
      decisionRaw === 'restocked' || decisionRaw === 'skipped' ? decisionRaw : null;

    if (!Number.isInteger(returnRecordId) || returnRecordId < 1) {
      return NextResponse.json({ error: 'Invalid returnRecordId' }, { status: 400, headers });
    }
    if (!decision) {
      return NextResponse.json(
        { error: 'decision must be restocked or skipped' },
        { status: 400, headers },
      );
    }

    try {
      const result = await applyBuyerReturnStockDecision(prisma, {
        returnRecordId,
        decision,
        ownerUserId: authenticatedUserId,
        isPlatformAdmin,
      });
      return NextResponse.json(
        {
          success: true,
          returnRecordId: result.recordId,
          stockDecision: result.stockDecision,
        },
        { headers },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply stock decision';
      const status =
        message === 'Forbidden'
          ? 403
          : message === 'Return record not found'
            ? 404
            : message.startsWith('Stock already decided')
              ? 400
              : 400;
      return NextResponse.json({ error: message }, { status, headers });
    }
  } catch (error) {
    console.error('[return-stock] POST error', error);
    return NextResponse.json({ error: 'Failed to apply stock decision' }, { status: 500, headers });
  }
}
