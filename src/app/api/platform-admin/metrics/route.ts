import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);

    const [activeAdmins, totalAdmins, totalAnnouncements, publishedAnnouncements] = await Promise.all([
      prisma.platformAdmin.count({ where: { isActive: true } }),
      prisma.platformAdmin.count(),
      prisma.platformAnnouncement.count(),
      prisma.platformAnnouncement.count({ where: { isPublished: true } }),
    ]);

    return NextResponse.json(
      {
        metrics: {
          totalAdmins,
          activeAdmins,
          totalAnnouncements,
          publishedAnnouncements,
          draftAnnouncements: Math.max(0, totalAnnouncements - publishedAnnouncements),
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

