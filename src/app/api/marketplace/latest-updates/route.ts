import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSecurityHeaders } from '@/utils/auth-security';

function parseLimit(req: NextRequest): number {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('limit');
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n)) return 20;
  return Math.min(Math.max(1, Math.floor(n)), 50);
}

export async function GET(req: NextRequest) {
  const headers = getSecurityHeaders();
  try {
    const limit = parseLimit(req);
    const items = await prisma.platformAnnouncement.findMany({
      where: { isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        category: true,
        imageUrl: true,
        linkUrl: true,
        publishedAt: true,
      },
    });

    return NextResponse.json(
      {
        updates: items.map((a) => ({
          ...a,
          publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
        })),
      },
      { status: 200, headers }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to load updates' }, { status: 500, headers });
  }
}

