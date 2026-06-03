import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';
import { requirePlatformAdminId } from '@/utils/platform-admin-auth';
import { platformAdminMutationRateLimiter } from '@/utils/rateLimiter';
import { auditAdmin } from '@/lib/audit';

function normTerm(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normLocale(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase();
  return t ? t : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid request format' }, { status: 400, headers });

    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.bidirectional === 'boolean') patch.bidirectional = body.bidirectional;

    if (body.fromTerm != null) {
      const t = normTerm(body.fromTerm);
      if (!t) return NextResponse.json({ error: 'Invalid fromTerm' }, { status: 400, headers });
      patch.fromTerm = t;
    }
    if (body.toTerm != null) {
      const t = normTerm(body.toTerm);
      if (!t) return NextResponse.json({ error: 'Invalid toTerm' }, { status: 400, headers });
      patch.toTerm = t;
    }
    if (body.fromLocale != null) patch.fromLocale = normLocale(body.fromLocale);
    if (body.toLocale != null) patch.toLocale = normLocale(body.toLocale);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400, headers });
    }

    const updated = await prisma.marketplaceSearchTermMap.update({
      where: { id },
      data: patch,
      select: {
        id: true,
        kind: true,
        fromTerm: true,
        toTerm: true,
        fromLocale: true,
        toLocale: true,
        bidirectional: true,
        enabled: true,
        createdByAdminId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    auditAdmin(req, {
      action: 'search_term_map.update',
      resourceType: 'MarketplaceSearchTermMap',
      resourceId: String(id),
      actorId: adminId,
      metadata: { fields: Object.keys(patch) },
    });

    return NextResponse.json(
      {
        row: {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
      { status: 200, headers },
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Term map not found' }, { status: 404, headers });
    }
    return NextResponse.json({ error: 'Failed to update term map' }, { status: 500, headers });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const adminId = requirePlatformAdminId(req);

    const rateLimitResponse = await platformAdminMutationRateLimiter(req, adminId);
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400, headers });

    await prisma.marketplaceSearchTermMap.delete({ where: { id } });

    auditAdmin(req, {
      action: 'search_term_map.delete',
      resourceType: 'MarketplaceSearchTermMap',
      resourceId: String(id),
      actorId: adminId,
    });

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED_PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      return NextResponse.json({ error: 'Term map not found' }, { status: 404, headers });
    }
    return NextResponse.json({ error: 'Failed to delete term map' }, { status: 500, headers });
  }
}

