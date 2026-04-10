import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';

/**
 * POST /api/platform-admin/reports/distributor/clear-all
 * Dismiss all from the admin notification bell only — does not delete rows (user detail / audit unchanged).
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    requirePlatformAdminId(req);
    const now = new Date();
    const result = await prisma.distributorReport.updateMany({
      where: { adminInboxDismissedAt: null },
      data: { adminInboxDismissedAt: now },
    });
    return NextResponse.json({ ok: true, dismissed: result.count }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('platform-admin reports clear-all', err);
    return NextResponse.json({ error: 'Failed to clear inbox' }, { status: 500, headers });
  }
}
