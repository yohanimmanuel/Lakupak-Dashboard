import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminReadRateLimiter } from '@/utils/rateLimiter';
import {
  MARKETPLACE_REGISTRATION_WINDOW_MS,
  loadRegistrationInboxStates,
  registrationStateKey,
} from '@/lib/platformAdminInboxState';

/**
 * GET /api/platform-admin/reports/distributor?limit=20
 * Recent buyer reports against distributors; includes unread count for admin navbar.
 */
export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminReadRateLimiter(req, adminId, 'reports-inbox');
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(req.url);
    const limitRaw = searchParams.get('limit');
    const limit = Math.min(50, Math.max(1, parseInt(limitRaw || '15', 10) || 15));

    const inboxWhere = { adminInboxDismissedAt: null };
    const marketplaceSince = new Date(Date.now() - MARKETPLACE_REGISTRATION_WINDOW_MS);

    const [unreadReports, items, upcomingUsers, recentMarketplaceUsers] = await Promise.all([
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
      prisma.user.findMany({
        where: { accountStatus: 'pending', isSuspended: false },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          company: { select: { name: true } },
        },
      }),
      prisma.marketplaceUser.findMany({
        where: { isSuspended: false, createdAt: { gte: marketplaceSince } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          storeName: true,
          createdAt: true,
        },
      }),
    ]);

    const reportItems = items.map((r) => ({
      id: r.id,
      kind: 'report' as const,
      source: 'dashboard' as const,
      userId: r.reportedDashboardUserId,
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

    const inboxStates = await loadRegistrationInboxStates(adminId, [
      ...upcomingUsers.map((u) => ({ source: 'dashboard' as const, userId: u.id })),
      ...recentMarketplaceUsers.map((u) => ({ source: 'marketplace' as const, userId: u.id })),
    ]);

    const dashboardRegistrations = upcomingUsers.flatMap((u) => {
      const state = inboxStates.get(registrationStateKey('dashboard', u.id));
      if (state?.dismissedAt) return [];
      const name =
        [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
        u.name ||
        u.email ||
        `User #${u.id}`;
      const readAt = state?.readAt ?? null;
      return [{
        id: -u.id,
        kind: 'registration' as const,
        source: 'dashboard' as const,
        userId: u.id,
        reasonCode: 'kyc_registration',
        reasonText: 'New upcoming distributor — review NIB and NPWP documents.',
        reasonDetail: u.company?.name ? `Company: ${u.company.name}` : null,
        imageUrls: [] as string[],
        imageCount: 0,
        createdAt: u.createdAt.toISOString(),
        adminReadAt: readAt ? readAt.toISOString() : null,
        isUnread: readAt == null,
        reportedDashboardUserId: u.id,
        reporterMarketplaceUserId: 0,
        distributorLabel: name,
        reporterLabel: u.email || 'Dashboard',
      }];
    });

    const marketplaceRegistrations = recentMarketplaceUsers.flatMap((u) => {
      const state = inboxStates.get(registrationStateKey('marketplace', u.id));
      if (state?.dismissedAt) return [];
      const name = u.name || u.storeName || u.username || u.email || `User #${u.id}`;
      const readAt = state?.readAt ?? null;
      return [{
        id: -(1_000_000_000 + u.id),
        kind: 'registration' as const,
        source: 'marketplace' as const,
        userId: u.id,
        reasonCode: 'marketplace_registration',
        reasonText: 'New marketplace user registered on the platform.',
        reasonDetail: u.username ? `@${u.username}` : null,
        imageUrls: [] as string[],
        imageCount: 0,
        createdAt: u.createdAt.toISOString(),
        adminReadAt: readAt ? readAt.toISOString() : null,
        isUnread: readAt == null,
        reportedDashboardUserId: 0,
        reporterMarketplaceUserId: u.id,
        distributorLabel: name,
        reporterLabel: u.email || 'Marketplace',
      }];
    });

    const unreadRegistrations =
      dashboardRegistrations.filter((i) => i.isUnread).length +
      marketplaceRegistrations.filter((i) => i.isUnread).length;

    const serialized = [...dashboardRegistrations, ...marketplaceRegistrations, ...reportItems]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);

    return NextResponse.json(
      {
        unreadCount: unreadReports + unreadRegistrations,
        items: serialized,
      },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('platform-admin reports distributor GET', err);
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500, headers });
  }
}
