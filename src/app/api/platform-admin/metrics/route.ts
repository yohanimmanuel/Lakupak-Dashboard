import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminReadRateLimiter } from '@/utils/rateLimiter';

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminReadRateLimiter(req, adminId, 'platform-metrics');
    if (rateLimitResponse) return rateLimitResponse;

    const [
      activeAdmins,
      totalAdmins,
      totalAnnouncements,
      publishedAnnouncements,
      dashboardUsers,
      dashboardSuspendedUsers,
      marketplaceUsers,
      marketplaceSuspendedUsers,
      drivers,
      totalHomeOffers,
      publishedHomeOffers,
      searchQueryLogs,
      searchTermMaps,
    ] = await Promise.all([
      prisma.platformAdmin.count({ where: { isActive: true } }),
      prisma.platformAdmin.count(),
      prisma.platformAnnouncement.count(),
      prisma.platformAnnouncement.count({ where: { isPublished: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { isSuspended: true } }),
      prisma.marketplaceUser.count(),
      prisma.marketplaceUser.count({ where: { isSuspended: true } }),
      prisma.driver.count(),
      prisma.marketplaceHomeOffer.count(),
      prisma.marketplaceHomeOffer.count({ where: { isPublished: true } }),
      prisma.marketplaceSearchQueryLog.count(),
      prisma.marketplaceSearchTermMap.count(),
    ]);

    const draftAnnouncements = Math.max(0, totalAnnouncements - publishedAnnouncements);
    // Drivers currently have no suspension fields in Prisma (`Driver` has no `isSuspended`),
    // so they are treated as always active in these platform-wide metrics.
    const platformUserTotal = dashboardUsers + marketplaceUsers + drivers;
    const dashboardActiveUsers = Math.max(0, dashboardUsers - dashboardSuspendedUsers);
    const marketplaceActiveUsers = Math.max(0, marketplaceUsers - marketplaceSuspendedUsers);
    const platformSuspendedUsers = dashboardSuspendedUsers + marketplaceSuspendedUsers;
    const platformActiveUsers = platformUserTotal - platformSuspendedUsers;

    return NextResponse.json(
      {
        metrics: {
          totalAdmins,
          activeAdmins,
          totalAnnouncements,
          publishedAnnouncements,
          draftAnnouncements,
          dashboardUsers,
          dashboardActiveUsers,
          dashboardSuspendedUsers,
          marketplaceUsers,
          marketplaceActiveUsers,
          marketplaceSuspendedUsers,
          drivers,
          platformUserTotal,
          platformActiveUsers,
          platformSuspendedUsers,
          totalHomeOffers,
          publishedHomeOffers,
          draftHomeOffers: Math.max(0, totalHomeOffers - publishedHomeOffers),
          searchQueryLogs,
          searchTermMaps,
        },
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to load metrics' }, { status: 500, headers });
  }
}

