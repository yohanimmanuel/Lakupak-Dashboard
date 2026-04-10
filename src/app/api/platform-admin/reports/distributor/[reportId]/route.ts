import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';

/**
 * DELETE /api/platform-admin/reports/distributor/[reportId]
 * Dismiss one report from the admin bell only — row kept for distributor user-detail history.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ reportId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    await requirePlatformAdminId(req);
    const { reportId } = await ctx.params;
    const id = parseInt(reportId, 10);
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: 'Invalid report id' }, { status: 400, headers });
    }

    const now = new Date();
    await prisma.distributorReport.update({
      where: { id },
      data: { adminInboxDismissedAt: now },
    });

    return NextResponse.json({ ok: true, id }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    if (typeof err === 'object' && err && 'code' in err && (err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Report not found' }, { status: 404, headers });
    }
    console.error('platform-admin report delete', err);
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500, headers });
  }
}
