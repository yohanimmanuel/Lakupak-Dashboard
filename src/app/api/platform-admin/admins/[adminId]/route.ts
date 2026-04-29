import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ adminId: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const actorId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, actorId);
    if (rateLimitResponse) return rateLimitResponse;

    const { adminId } = await ctx.params;
    const id = Number(adminId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid admin id' }, { status: 400, headers });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const { isActive } = body as { isActive?: unknown };
    if (typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'isActive must be boolean' }, { status: 400, headers });
    }

    // Prevent self-deactivation (avoids locking yourself out by accident).
    if (actorId === id && isActive === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own admin account.' }, { status: 400, headers });
    }

    const updated = await prisma.platformAdmin.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, name: true, isActive: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ ok: true, admin: updated }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to update admin' }, { status: 500, headers });
  }
}

