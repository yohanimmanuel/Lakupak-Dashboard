import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { verifyAccessToken } from '@/lib/jwt';
import { broadcastPlatformAdminInboxRefresh } from '@/utils/websocketBroadcast';

const REASON_CODES = new Set(['fraud', 'poor_service', 'quality', 'policy', 'other']);

/**
 * POST /api/mobile/reports/distributor
 * Authenticated marketplace buyer reports a dashboard distributor (seller) to platform admin.
 */
export async function POST(request: NextRequest) {
  const headers = getSecurityHeaders();

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401, headers });
    }

    let reporterMarketplaceUserId: number;
    try {
      const payload = verifyAccessToken(authHeader.replace('Bearer ', ''));
      reporterMarketplaceUserId = payload.sub;
    } catch {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers });
    }

    let body: {
      distributorId?: number | string;
      reasonCode?: string;
      reasonText?: string;
      reasonDetail?: string | null;
      imageUrls?: unknown;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
    }

    const distributorIdRaw = body.distributorId;
    const reportedDashboardUserId =
      typeof distributorIdRaw === 'number'
        ? distributorIdRaw
        : typeof distributorIdRaw === 'string'
          ? parseInt(distributorIdRaw.trim(), 10)
          : NaN;

    if (!Number.isFinite(reportedDashboardUserId) || reportedDashboardUserId < 1) {
      return NextResponse.json({ error: 'Invalid distributorId' }, { status: 400, headers });
    }

    const reasonCode = typeof body.reasonCode === 'string' ? body.reasonCode.trim() : '';
    if (!reasonCode || !REASON_CODES.has(reasonCode)) {
      return NextResponse.json({ error: 'Invalid reasonCode' }, { status: 400, headers });
    }

    const reasonText = typeof body.reasonText === 'string' ? body.reasonText.trim() : '';
    if (!reasonText) {
      return NextResponse.json({ error: 'reasonText is required' }, { status: 400, headers });
    }

    const reasonDetail =
      typeof body.reasonDetail === 'string' && body.reasonDetail.trim()
        ? body.reasonDetail.trim().slice(0, 4000)
        : null;

    if (reasonCode === 'other' && !reasonDetail) {
      return NextResponse.json({ error: 'reasonDetail is required when reason is other' }, { status: 400, headers });
    }

    let safeImageUrls: string[] = [];
    if (Array.isArray(body.imageUrls)) {
      safeImageUrls = body.imageUrls
        .filter((u): u is string => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && (u.startsWith('https://') || u.startsWith('http://')))
        .slice(0, 5);
    }

    if (safeImageUrls.length < 1) {
      return NextResponse.json(
        { error: 'At least one photo is required as proof (imageUrls)' },
        { status: 400, headers }
      );
    }

    const seller = await prisma.user.findUnique({
      where: { id: reportedDashboardUserId },
      select: { id: true },
    });
    if (!seller) {
      return NextResponse.json({ error: 'Distributor not found' }, { status: 404, headers });
    }

    const report = await prisma.distributorReport.create({
      data: {
        reportedDashboardUserId,
        reporterMarketplaceUserId,
        reasonCode,
        reasonText: reasonText.slice(0, 500),
        reasonDetail,
        imageUrls: safeImageUrls,
      },
      select: { id: true, createdAt: true },
    });

    void broadcastPlatformAdminInboxRefresh().catch(() => {
      /* best-effort real-time refresh for platform admin bell */
    });

    return NextResponse.json(
      {
        ok: true,
        id: report.id,
        message: 'Report submitted. Our team will review it.',
        createdAt: report.createdAt.toISOString(),
      },
      { status: 201, headers }
    );
  } catch (e) {
    console.error('Distributor report POST error:', e);
    return NextResponse.json({ error: 'Failed to submit report.' }, { status: 500, headers });
  }
}
