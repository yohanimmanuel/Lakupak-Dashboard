import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { decimalToNumber } from '@/services/orders/utils';
import {
  resolveBuyerRefIdForOrder,
  syncBuyerReturnRecordsFromRequest,
} from '@/lib/clients/buyerReturnRecords';

/**
 * POST /api/buyers/return-records-sync
 * Body: { buyerId: string }
 *
 * Backfills BuyerReturnRecord rows from Accepted return requests that are missing CRM history.
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
    const buyerId = typeof (body as { buyerId?: unknown }).buyerId === 'string'
      ? (body as { buyerId: string }).buyerId.trim()
      : '';
    if (!buyerId) {
      return NextResponse.json({ error: 'buyerId is required' }, { status: 400, headers });
    }

    const buyer = await prisma.buyer.findUnique({
      where: { buyerId },
      select: { id: true, userId: true },
    });
    if (!buyer) {
      return NextResponse.json({ error: 'Buyer not found' }, { status: 404, headers });
    }
    if (
      !isPlatformAdmin &&
      authenticatedUserId != null &&
      buyer.userId != null &&
      buyer.userId !== authenticatedUserId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers });
    }

    const acceptedRequests = await prisma.orderReturnRequest.findMany({
      where: {
        status: 'Accepted',
        order: {
          buyerId,
          ...(isPlatformAdmin || authenticatedUserId == null
            ? {}
            : { userId: authenticatedUserId }),
        },
      },
      include: {
        items: true,
        order: { select: { orderId: true, buyerId: true, userId: true, returnedAt: true } },
      },
      orderBy: { id: 'asc' },
    });

    let synced = 0;
    for (const rr of acceptedRequests) {
      if (!rr.items.length) continue;
      const existingCount = await prisma.buyerReturnRecord.count({
        where: { buyerRefId: buyer.id, returnRequestId: rr.id },
      });
      if (existingCount > 0) continue;

      const buyerRefId = await resolveBuyerRefIdForOrder(prisma, {
        buyerId: rr.order.buyerId,
        userId: rr.order.userId,
      });
      if (buyerRefId == null) continue;

      await syncBuyerReturnRecordsFromRequest(prisma, {
        buyerRefId,
        orderNo: rr.order.orderId,
        returnRequestId: rr.id,
        reason: rr.reason ?? null,
        returnedAt: rr.order.returnedAt ?? rr.createdAt,
        items: rr.items.map((item) => ({
          returnRequestItemId: item.id,
          productNameSnapshot: item.productNameSnapshot,
          productId: item.productId,
          productSkuSnapshot: item.productSkuSnapshot,
          variantNameSnapshot: item.variantNameSnapshot,
          packageType: item.packageType,
          piecesPerPackage: item.piecesPerPackage,
          quantityReturned: item.quantityReturned,
          lineCreditAmount: decimalToNumber(item.lineCreditAmount),
        })),
      });
      synced += 1;
    }

    const rows = await prisma.buyerReturnRecord.findMany({
      where: { buyerRefId: buyer.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return NextResponse.json(
      {
        success: true,
        synced,
        returnDetails: rows.map((row) => ({
          id: row.id,
          orderNo: row.orderNo,
          returnRequestId: row.returnRequestId ?? undefined,
          product: row.product,
          productId: row.productId ?? undefined,
          sku: row.skuSnapshot ?? undefined,
          variantName: row.variantName ?? undefined,
          stockType: row.stockType ?? undefined,
          piecesPerPackage: row.piecesPerPackage ?? undefined,
          quantityReturned: row.quantityReturned,
          lineCreditAmount: Number(row.lineCreditAmount),
          reason: row.reason ?? undefined,
          returnedAt: row.returnedAt ? row.returnedAt.toISOString() : undefined,
          stockDecision:
            row.stockDecision === 'restocked' || row.stockDecision === 'skipped'
              ? row.stockDecision
              : null,
          stockDecidedAt: row.stockDecidedAt ? row.stockDecidedAt.toISOString() : undefined,
        })),
      },
      { headers },
    );
  } catch (error) {
    console.error('[return-records-sync] POST error', error);
    return NextResponse.json({ error: 'Failed to sync return records' }, { status: 500, headers });
  }
}
