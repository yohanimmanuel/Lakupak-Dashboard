import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { Prisma } from '@prisma/client';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';

function parseId(params: { id?: string }) {
  const n = Number(params.id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const params = await ctx.params;
    const id = parseId(params);
    if (!id) return NextResponse.json({ error: 'Invalid user id' }, { status: 400, headers });

    const body = await req.json().catch(() => null);
    if (!body || typeof body.isSuspended !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers });
    }

    const isSuspended = Boolean(body.isSuspended);
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

    let updated: { id: number; isSuspended: boolean; suspendedAt: Date | null; suspensionReason: string | null };
    try {
      updated = await prisma.marketplaceUser.update({
        where: { id },
        data: {
          isSuspended,
          suspendedAt: isSuspended ? new Date() : null,
          suspensionReason: isSuspended ? reason : null,
        },
        select: { id: true, isSuspended: true, suspendedAt: true, suspensionReason: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return NextResponse.json({ error: 'User not found' }, { status: 404, headers });
      }
      throw err;
    }

    return NextResponse.json(
      {
        user: {
          ...updated,
          suspendedAt: updated.suspendedAt ? updated.suspendedAt.toISOString() : null,
        },
      },
      { status: 200, headers }
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    return NextResponse.json({ error: 'Failed to update suspension' }, { status: 500, headers });
  }
}

