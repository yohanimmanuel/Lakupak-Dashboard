import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';

/**
 * PATCH /api/platform-admin/reports/distributor/[reportId]/read
 * Mark a single report as reviewed by admin (clears navbar unread for that item).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ reportId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const { reportId } = await ctx.params;
    const id = parseInt(reportId, 10);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: 'Invalid report id' }, { status: 400, headers });
    }

    const updated = await prisma.distributorReport.update({
      where: { id },
      data: { adminReadAt: new Date() },
      select: { id: true, adminReadAt: true },
    });

    return NextResponse.json(
      { ok: true, id: updated.id, adminReadAt: updated.adminReadAt?.toISOString() ?? null },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    if (typeof err === 'object' && err && 'code' in err && (err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Report not found' }, { status: 404, headers });
    }
    console.error('platform-admin report mark read', err);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500, headers });
  }
}
