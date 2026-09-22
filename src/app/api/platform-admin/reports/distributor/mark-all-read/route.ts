import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';
import { markRegistrationInboxAllRead } from '@/lib/platformAdminInboxState';

/**
 * POST /api/platform-admin/reports/distributor/mark-all-read
 * Mark all distributor reports as reviewed.
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const now = new Date();
    const { result, registrationUpdated } = await prisma.$transaction(async (tx) => {
      const result = await tx.distributorReport.updateMany({
        where: { adminReadAt: null, adminInboxDismissedAt: null },
        data: { adminReadAt: now },
      });
      const registrationUpdated = await markRegistrationInboxAllRead(adminId, tx);
      return { result, registrationUpdated };
    });
    return NextResponse.json(
      { ok: true, updated: result.count + registrationUpdated },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('platform-admin reports mark-all-read', err);
    return NextResponse.json({ error: 'Failed to update reports' }, { status: 500, headers });
  }
}
