import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';

/**
 * GET /api/platform-admin/reports/distributor?limit=20
 * Recent buyer reports against distributors; includes unread count for admin navbar.
 */
export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);
    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get('limit');
    const limit = Math.min(50, Math.max(1, parseInt(limitRaw || '15', 10) || 15));

    const inboxWhere = { adminInboxDismissedAt: null };

    const [unreadCount, items] = await Promise.all([
      prisma.distributorReport.count({
        where: { adminReadAt: null, adminInboxDismissedAt: null },
      }),
      prisma.distributorReport.findMany({
        where: inboxWhere,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          reasonCode: true,
          reasonText: true,
          reasonDetail: true,
          imageUrls: true,
          createdAt: true,
          adminReadAt: true,
          reportedDashboardUserId: true,
          reporterMarketplaceUserId: true,
          reportedDashboardUser: {
            select: {
              id: true,
              email: true,
              name: true,
              company: { select: { name: true } },
            },
          },
          reporter: {
            select: { id: true, username: true, name: true },
          },
        },
      }),
    ]);

    const serialized = items.map((r) => ({
      id: r.id,
      reasonCode: r.reasonCode,
      reasonText: r.reasonText,
      reasonDetail: r.reasonDetail,
      imageUrls: r.imageUrls ?? [],
      imageCount: (r.imageUrls ?? []).length,
      createdAt: r.createdAt.toISOString(),
      adminReadAt: r.adminReadAt ? r.adminReadAt.toISOString() : null,
      isUnread: r.adminReadAt == null,
      reportedDashboardUserId: r.reportedDashboardUserId,
      reporterMarketplaceUserId: r.reporterMarketplaceUserId,
      distributorLabel:
        r.reportedDashboardUser.company?.name ||
        r.reportedDashboardUser.name ||
        r.reportedDashboardUser.email ||
        `User #${r.reportedDashboardUserId}`,
      reporterLabel: r.reporter.name || r.reporter.username || `Buyer #${r.reporterMarketplaceUserId}`,
    }));

    return NextResponse.json({ unreadCount, items: serialized }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('platform-admin reports distributor GET', err);
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500, headers });
  }
}
