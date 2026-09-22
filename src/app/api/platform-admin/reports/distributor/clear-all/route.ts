import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';
import { auditAdmin } from '@/lib/audit';
import { dismissRegistrationInboxAll } from '@/lib/platformAdminInboxState';

/**
 * POST /api/platform-admin/reports/distributor/clear-all
 * Dismiss all from the admin notification bell only — does not delete rows (user detail / audit unchanged).
 */
export async function POST(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const now = new Date();
    const { result, registrationDismissed } = await prisma.$transaction(async (tx) => {
      const result = await tx.distributorReport.updateMany({
        where: { adminInboxDismissedAt: null },
        data: { adminInboxDismissedAt: now },
      });
      const registrationDismissed = await dismissRegistrationInboxAll(adminId, tx);
      return { result, registrationDismissed };
    });

    auditAdmin(req, {
      action: 'report.dismiss_all',
      resourceType: 'DistributorReport',
      actorId: adminId,
      metadata: { dismissed: result.count, registrationDismissed },
    });

    return NextResponse.json(
      { ok: true, dismissed: result.count + registrationDismissed },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    console.error('platform-admin reports clear-all', err);
    return NextResponse.json({ error: 'Failed to clear inbox' }, { status: 500, headers });
  }
}
