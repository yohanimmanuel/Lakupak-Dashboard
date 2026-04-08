import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Public single published announcement (detail view in marketplace app). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const headers = getSecurityHeaders();
  try {
    const params = await ctx.params;
    const id = parseId(params.id);
    if (!id) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers });
    }

    const row = await prisma.platformAnnouncement.findFirst({
      where: { id, isPublished: true },
      select: {
        id: true,
        title: true,
        body: true,
        category: true,
        imageUrl: true,
        linkUrl: true,
        publishedAt: true,
        createdAt: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers });
    }

    return NextResponse.json(
      {
        announcement: {
          ...row,
          publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
        },
      },
      { status: 200, headers }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to load update' }, { status: 500, headers });
  }
}
